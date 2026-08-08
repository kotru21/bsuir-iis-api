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
import { hasPrivateHeaders } from "./privateHeaders";
import { buildRequestKey } from "./requestCacheKey";
import { serializeRequestBody } from "./serializeBody";
import { buildUrl } from "./url";

/**
 * Executes JSON HTTP request with timeout, retry/backoff, deduplication and cache support.
 */
export async function requestJson<T>(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const endpoint = buildUrl(config.baseUrl, path, options.query);
  const method = options.method ?? "GET";
  const requestCanRetry = method === "GET";
  const maxRetries = requestCanRetry ? config.retries : 0;
  const maxAttempts = maxRetries + 1;
  const headers = new Headers({
    Accept: "application/json"
  });

  if (config.userAgent) {
    headers.set("User-Agent", config.userAgent);
  }
  if (options.headers) {
    const requestHeaders = new Headers(options.headers);
    for (const [key, value] of requestHeaders) {
      headers.set(key, value);
    }
  }

  const body = serializeRequestBody(options.body, headers);

  const cacheMode = options.cache ?? "default";
  // Caching is disabled only when a relevant signal is already aborted. A live
  // signal is fine — its job is to cancel the network request, not to signal
  // "this caller has private data." In-flight dedup is still disabled for
  // per-call signals so callers do not inherit each other's cancellation semantics.
  const signalAborted = options.signal?.aborted === true || config.signal?.aborted === true;
  const hasPrivateRequestHeaders = hasPrivateHeaders(headers);
  const canUseCaching =
    config.cacheTtlMs !== undefined &&
    method === "GET" &&
    !signalAborted &&
    !hasPrivateRequestHeaders;
  const canReadFromCache = canUseCaching && cacheMode === "default";
  const canWriteToCache = canUseCaching && cacheMode !== "no-store";
  const perCallSignalProvided = options.signal !== undefined;
  const canUseDedup =
    config.dedupeInFlight &&
    method === "GET" &&
    !signalAborted &&
    !hasPrivateRequestHeaders &&
    cacheMode === "default" &&
    !perCallSignalProvided;
  let requestKey: string | undefined;
  const ensureRequestKey = (): string => {
    requestKey ??= buildRequestKey(method, endpoint, headers);
    return requestKey;
  };

  let lastSuccessResponse:
    { hookCtx: RequestHookContext; durationMs: number; status: number } | undefined;

  const runResponseValidator = (payload: T): void => {
    if (!options.responseValidator) {
      return;
    }
    const responseMeta = lastSuccessResponse ?? {
      hookCtx: baseHookContext(method, path, endpoint, maxAttempts, maxAttempts, options.query),
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
    const cached = tryReadCacheEntry(config, ensureRequestKey());
    if (cached !== undefined) {
      const cacheHitCtx: ResponseHookContext = {
        ...baseHookContext(method, path, endpoint, 1, maxAttempts, options.query),
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
      method,
      headers,
      body,
      options,
      maxRetries,
      maxAttempts,
      onSuccessMeta: (meta) => {
        lastSuccessResponse = meta;
      }
    });
    runResponseValidator(payload);
    if (canWriteToCache) {
      const cached = setCache(config, ensureRequestKey(), payload, lastSuccessResponse?.status);
      if (cached !== undefined) {
        return cached;
      }
    }
    return payload;
  };

  if (canUseDedup) {
    const key = ensureRequestKey();
    const inFlight = config.inFlightRequests.get(key);
    if (inFlight) {
      return (await inFlight) as T;
    }

    const inFlightPromise: Promise<T> = (async () => {
      try {
        return await requestAndMaybeCache();
      } finally {
        config.inFlightRequests.delete(key);
      }
    })();
    config.inFlightRequests.set(key, inFlightPromise);
    return await inFlightPromise;
  }

  return await requestAndMaybeCache();
}
