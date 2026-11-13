import type {
  ErrorHookContext,
  InFlightRequest,
  InternalClientConfig,
  RequestHookContext,
  RequestOptions,
  ResponseHookContext,
  SharedRequestResult
} from "../types";
import { setCache, tryReadCacheEntry } from "./cache";
import { invokeHookSafely } from "./hooks";
import { baseHookContext, performRequestWithRetry } from "./performRequest";
import { buildRequestKey } from "./requestCacheKey";
import { buildUrl } from "./url";
import { deepFreezeJson } from "../../utils/deepFreezeJson";

/**
 * Registers a deduplicated request under `requestKey`. `run` receives the signal
 * that cancels the shared request; it is aborted only when its last waiter aborts.
 */
function startSharedRequest(
  config: Readonly<InternalClientConfig>,
  requestKey: string,
  run: (signal: AbortSignal) => Promise<SharedRequestResult>
): InFlightRequest {
  const controller = new AbortController();
  // Runs past its first `await` before the `finally`, so `entry` is assigned by then.
  const runAndDetach = async (): Promise<SharedRequestResult> => {
    try {
      return await run(controller.signal);
    } finally {
      // A cancelled entry may already have been replaced by a fresh request.
      if (config.inFlightRequests.get(requestKey) === entry) {
        config.inFlightRequests.delete(requestKey);
      }
    }
  };
  const entry: InFlightRequest = { controller, waiters: 0, result: runAndDetach() };
  config.inFlightRequests.set(requestKey, entry);
  return entry;
}

const LEFT_EARLY = Symbol("left early");

/**
 * Waits for a shared request on behalf of one caller.
 *
 * - No signal: the caller waits for the outcome and keeps the request alive.
 * - Signal aborts while others still wait: only this caller stops waiting and
 *   rejects with its own abort reason; the request carries on for the others.
 * - Signal aborts and nobody else waits: the shared request is cancelled and the
 *   caller settles with its outcome — exactly what a non-deduplicated request
 *   cancelled by this signal does (same error, `onError` reported first).
 */
async function waitForSharedRequest(
  config: Readonly<InternalClientConfig>,
  requestKey: string,
  entry: InFlightRequest,
  signal: AbortSignal | undefined
): Promise<SharedRequestResult> {
  entry.waiters += 1;
  if (!signal) {
    return await entry.result;
  }
  // Removes the abort listener once this caller is done waiting, whatever the outcome.
  const listenerScope = new AbortController();
  const leftEarly = new Promise<typeof LEFT_EARLY>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        entry.waiters -= 1;
        if (entry.waiters > 0) {
          resolve(LEFT_EARLY);
          return;
        }
        // Detach first so the next caller starts a fresh request instead of joining
        // a cancelled one.
        if (config.inFlightRequests.get(requestKey) === entry) {
          config.inFlightRequests.delete(requestKey);
        }
        entry.controller.abort(signal.reason);
      },
      { once: true, signal: listenerScope.signal }
    );
  });
  try {
    const outcome = await Promise.race([entry.result, leftEarly]);
    if (outcome === LEFT_EARLY) {
      const reason: unknown = signal.reason;
      throw reason;
    }
    return outcome;
  } finally {
    listenerScope.abort();
  }
}

/**
 * Executes a JSON GET request with timeout, retry/backoff, deduplication and cache support.
 *
 * The SDK is read-only: every IIS endpoint it wraps is a GET, and callers cannot pass
 * headers or bodies, so requests carry no per-identity data and are safe to cache/share.
 * The resolved payload is always deep-frozen (network, cache hit or deduplicated).
 */
export async function requestJson<T>(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const endpoint = buildUrl(config.baseUrl, path, options.query);
  const maxRetries = config.retries;
  const maxAttempts = maxRetries + 1;
  const headers = new Headers({ Accept: "application/json" });
  if (config.userAgent) {
    headers.set("User-Agent", config.userAgent);
  }

  const cacheMode = options.cache ?? "default";
  // Caching and dedup are disabled only when a relevant signal is already aborted.
  // A live signal is fine — its job is to cancel this caller's wait / request.
  const signalAborted = options.signal?.aborted === true || config.signal?.aborted === true;
  const canUseCaching = config.cacheTtlMs !== undefined && !signalAborted;
  const canReadFromCache = canUseCaching && cacheMode === "default";
  const canWriteToCache = canUseCaching && cacheMode !== "no-store";
  const canUseDedup = config.dedupeInFlight && !signalAborted && cacheMode === "default";
  const requestKey = buildRequestKey(endpoint);

  /**
   * Runs `responseValidator`; a rejection is reported to `onError` (with the context of
   * the attempt / cache hit that produced the payload) and re-thrown. `onResponse` is
   * fired by the callers only after this passes, so every call ends with exactly one
   * of the two.
   */
  const validateOrReport = (payload: T, hookCtx: RequestHookContext, durationMs: number): void => {
    if (!options.responseValidator) {
      return;
    }
    try {
      options.responseValidator(payload);
    } catch (error: unknown) {
      const errorCtx: ErrorHookContext = { ...hookCtx, durationMs, error, deduplicated: false };
      invokeHookSafely(config.hooks.onError, errorCtx);
      throw error;
    }
  };

  if (canReadFromCache) {
    const cached = tryReadCacheEntry(config, requestKey);
    if (cached !== undefined) {
      const cacheHitCtx = baseHookContext(path, endpoint, 1, maxAttempts, options.query);
      // Re-validate on cache hit so a shared/hand-populated store cannot bypass
      // responseValidator when the current client has validation configured.
      const cachedValue = cached.value as T;
      try {
        validateOrReport(cachedValue, cacheHitCtx, 0);
      } catch (error: unknown) {
        // Evict the rejected entry: otherwise every call fails from cache until the
        // TTL expires, while the next network response might well be valid.
        config.responseCache.delete(requestKey);
        throw error;
      }
      const cacheHitResponseCtx: ResponseHookContext = {
        ...cacheHitCtx,
        // Entries written by this pipeline always carry the real status; the 200
        // fallback only covers hand-populated cache maps.
        status: cached.status ?? 200,
        durationMs: 0,
        fromCache: true,
        deduplicated: false
      };
      invokeHookSafely(config.hooks.onResponse, cacheHitResponseCtx);
      return cachedValue;
    }
  }

  const requestAndMaybeCache = async (
    signal: AbortSignal | undefined
  ): Promise<SharedRequestResult> => {
    const { payload, hookCtx, durationMs, status } = await performRequestWithRetry<T>({
      config,
      path,
      endpoint,
      headers,
      options: { ...options, signal },
      maxRetries,
      maxAttempts
    });
    validateOrReport(payload, hookCtx, durationMs);
    const responseCtx: ResponseHookContext = {
      ...hookCtx,
      status,
      durationMs,
      fromCache: false,
      deduplicated: false
    };
    invokeHookSafely(config.hooks.onResponse, responseCtx);
    if (canWriteToCache) {
      const cached = setCache(config, requestKey, payload, status);
      if (cached !== undefined) {
        return { value: cached, status };
      }
    }
    // Same shape guarantee on every path: cache hits, deduplicated and plain network
    // responses are all deep-frozen, so mutability never depends on client options.
    return { value: deepFreezeJson(payload), status };
  };

  if (!canUseDedup) {
    const result = await requestAndMaybeCache(options.signal);
    return result.value as T;
  }

  const inFlight = config.inFlightRequests.get(requestKey);
  if (!inFlight) {
    // This caller sends the request; the pipeline reports its hooks as usual.
    const entry = startSharedRequest(config, requestKey, requestAndMaybeCache);
    const shared = await waitForSharedRequest(config, requestKey, entry, options.signal);
    return shared.value as T;
  }

  // Joining another caller's request: no attempt of our own, so no onRequest/onRetry,
  // but exactly one onResponse/onError per call so call-level metrics stay complete.
  const joinedAt = Date.now();
  const joinedCtx = baseHookContext(path, endpoint, 1, maxAttempts, options.query);
  try {
    // Every concurrent caller receives the same (already frozen) object.
    const shared = await waitForSharedRequest(config, requestKey, inFlight, options.signal);
    invokeHookSafely(config.hooks.onResponse, {
      ...joinedCtx,
      status: shared.status ?? 200,
      durationMs: Date.now() - joinedAt,
      fromCache: false,
      deduplicated: true
    });
    return shared.value as T;
  } catch (error: unknown) {
    invokeHookSafely(config.hooks.onError, {
      ...joinedCtx,
      durationMs: Date.now() - joinedAt,
      error,
      deduplicated: true
    });
    throw error;
  }
}
