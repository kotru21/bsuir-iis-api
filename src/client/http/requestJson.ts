import type {
  ErrorHookContext,
  InternalClientConfig,
  RequestHookContext,
  RequestOptions,
  ResponseHookContext
} from "../types";
import { setCache, tryReadCacheEntry } from "./cache";
import { invokeHookSafely } from "./hooks";
import { baseHookContext, performRequestWithRetry } from "./performRequest";
import { buildRequestKey } from "./requestCacheKey";
import { buildUrl } from "./url";
import { deepFreezeJson } from "../../utils/deepFreezeJson";

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
  // Caching is disabled only when a relevant signal is already aborted. A live
  // signal is fine — its job is to cancel the network request. In-flight dedup is
  // still disabled for per-call signals so callers do not inherit each other's
  // cancellation semantics.
  const signalAborted = options.signal?.aborted === true || config.signal?.aborted === true;
  const canUseCaching = config.cacheTtlMs !== undefined && !signalAborted;
  const canReadFromCache = canUseCaching && cacheMode === "default";
  const canWriteToCache = canUseCaching && cacheMode !== "no-store";
  const canUseDedup =
    config.dedupeInFlight &&
    !signalAborted &&
    cacheMode === "default" &&
    options.signal === undefined;
  const requestKey = buildRequestKey(endpoint);

  let lastSuccessResponse:
    { hookCtx: RequestHookContext; durationMs: number; status: number } | undefined;

  const runResponseValidator = (payload: T): void => {
    if (!options.responseValidator) {
      return;
    }
    const responseMeta = lastSuccessResponse ?? {
      hookCtx: baseHookContext(path, endpoint, maxAttempts, maxAttempts, options.query),
      durationMs: 0
    };
    try {
      options.responseValidator(payload);
    } catch (error: unknown) {
      const errorCtx: ErrorHookContext = {
        ...responseMeta.hookCtx,
        durationMs: responseMeta.durationMs,
        error
      };
      invokeHookSafely(config.hooks.onError, errorCtx);
      throw error;
    }
  };

  if (canReadFromCache) {
    const cached = tryReadCacheEntry(config, requestKey);
    if (cached !== undefined) {
      const cacheHitCtx: ResponseHookContext = {
        ...baseHookContext(path, endpoint, 1, maxAttempts, options.query),
        // Entries written by this pipeline always carry the real status; the 200
        // fallback only covers hand-populated cache maps.
        status: cached.status ?? 200,
        durationMs: 0,
        fromCache: true
      };
      invokeHookSafely(config.hooks.onResponse, cacheHitCtx);
      // Re-validate on cache hit so a shared/hand-populated store cannot bypass
      // responseValidator when the current client has validation configured.
      const cachedValue = cached.value as T;
      runResponseValidator(cachedValue);
      return cachedValue;
    }
  }

  const requestAndMaybeCache = async (): Promise<T> => {
    const payload = await performRequestWithRetry<T>({
      config,
      path,
      endpoint,
      headers,
      options,
      maxRetries,
      maxAttempts,
      onSuccessMeta: (meta) => {
        lastSuccessResponse = meta;
      }
    });
    runResponseValidator(payload);
    if (canWriteToCache) {
      const cached = setCache(config, requestKey, payload, lastSuccessResponse?.status);
      if (cached !== undefined) {
        return cached;
      }
    }
    // Same shape guarantee on every path: cache hits, deduplicated and plain network
    // responses are all deep-frozen, so mutability never depends on client options.
    return deepFreezeJson(payload);
  };

  if (canUseDedup) {
    const inFlight = config.inFlightRequests.get(requestKey);
    if (inFlight) {
      return (await inFlight) as T;
    }

    const inFlightPromise: Promise<T> = (async () => {
      try {
        // Every concurrent caller receives this same (already frozen) object.
        return await requestAndMaybeCache();
      } finally {
        config.inFlightRequests.delete(requestKey);
      }
    })();
    config.inFlightRequests.set(requestKey, inFlightPromise);
    return await inFlightPromise;
  }

  return await requestAndMaybeCache();
}
