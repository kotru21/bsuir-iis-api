import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirTimeoutError
} from "../errors";
import { mergeSignals } from "../mergeSignals";
import type {
  ErrorHookContext,
  InternalClientConfig,
  QueryParams,
  RequestHookContext,
  RequestMethod,
  RequestOptions,
  ResponseHookContext,
  RetryHookContext
} from "../types";
import { isAbortError } from "../../utils/guards";
import { setCache, tryReadCache } from "./cache";
import { parseBody } from "./response";
import { getRetryDecision, getRetryDelayMs, RETRIABLE_STATUS_CODES, sleep } from "./retry";
import { buildUrl } from "./url";

const CACHE_KEY_HEADER_ALLOWLIST = new Set<string>(["accept", "accept-language"]);

function normalizeHeadersForRequestKey(headers: Headers): string {
  return [...headers.entries()]
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .filter(([key]) => CACHE_KEY_HEADER_ALLOWLIST.has(key))
    .toSorted((a, b) => {
      if (a[0] !== b[0]) {
        return a[0] < b[0] ? -1 : 1;
      }
      if (a[1] !== b[1]) {
        return a[1] < b[1] ? -1 : 1;
      }
      return 0;
    })
    .map(([key, value]) => `${key}:${value}`)
    .join("\n");
}

function buildRequestKey(method: RequestMethod, endpoint: string, headers: Headers): string {
  return `${method}\n${endpoint}\n${normalizeHeadersForRequestKey(headers)}`;
}

function isPrivateHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  if (
    normalized === "authorization" ||
    normalized === "proxy-authorization" ||
    normalized === "cookie" ||
    normalized === "set-cookie" ||
    normalized === "x-api-key"
  ) {
    return true;
  }
  if (normalized.endsWith("-api-key")) {
    return true;
  }
  return normalized.includes("token") || normalized.includes("secret");
}

function hasPrivateHeaders(headers: Headers): boolean {
  for (const [key] of headers.entries()) {
    if (isPrivateHeader(key)) {
      return true;
    }
  }
  return false;
}

function baseHookContext(
  method: RequestMethod,
  path: string,
  endpoint: string,
  attempt: number,
  maxAttempts: number,
  query: QueryParams | undefined
): RequestHookContext {
  return {
    method,
    path,
    endpoint,
    attempt,
    maxAttempts,
    query
  };
}

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
    for (const [key, value] of new Headers(options.headers)) {
      headers.set(key, value);
    }
  }

  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const cacheMode = options.cache ?? "default";
  // Caching and dedup are disabled when a per-call signal is provided (caller manages lifecycle)
  // OR when a global client signal is already aborted — stale data must not be served after abort.
  const hasActiveSignal = options.signal != null || config.signal?.aborted === true;
  const hasPrivateRequestHeaders = hasPrivateHeaders(headers);
  const canUseCaching =
    config.cacheTtlMs !== undefined &&
    method === "GET" &&
    !hasActiveSignal &&
    !hasPrivateRequestHeaders;
  const canReadFromCache = canUseCaching && cacheMode === "default";
  const canWriteToCache = canUseCaching && cacheMode !== "no-store";
  const canUseDedup =
    config.dedupeInFlight &&
    method === "GET" &&
    !hasActiveSignal &&
    !hasPrivateRequestHeaders &&
    cacheMode === "default";
  let requestKey: string | undefined;
  const ensureRequestKey = (): string => {
    requestKey ??= buildRequestKey(method, endpoint, headers);
    return requestKey;
  };

  if (canReadFromCache) {
    const cached = tryReadCache(config, ensureRequestKey());
    if (cached !== undefined) {
      const cacheHitCtx: ResponseHookContext = {
        ...baseHookContext(method, path, endpoint, 1, maxAttempts, options.query),
        status: 200,
        durationMs: 0,
        fromCache: true
      };
      config.hooks.onResponse?.(cacheHitCtx);
      return cached as T;
    }
  }

  const performRequest = async (): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const attemptNumber = attempt + 1;
      const startedAt = Date.now();
      const hookCtx = baseHookContext(
        method,
        path,
        endpoint,
        attemptNumber,
        maxAttempts,
        options.query
      );

      config.hooks.onRequest?.(hookCtx);

      const requestSignal = mergeSignals([options.signal, config.signal], config.timeoutMs);

      try {
        const requestInit: RequestInit = {
          method,
          headers,
          signal: requestSignal
        };
        if (body !== undefined) {
          requestInit.body = body;
        }

        const response = await config.fetchImpl(endpoint, requestInit);

        if (!response.ok) {
          const errorBody = await parseBody(response, config.maxResponseBytes);
          if (attempt < maxRetries && RETRIABLE_STATUS_CODES.has(response.status)) {
            const retryDecision = getRetryDecision(config, attempt, response.headers.get("retry-after"));
            if (retryDecision.retryable) {
              const retryCtx: RetryHookContext = {
                ...hookCtx,
                delayMs: retryDecision.delayMs,
                reason: "http_status",
                status: response.status
              };
              config.hooks.onRetry?.(retryCtx);
              await sleep(retryDecision.delayMs);
              continue;
            }
            const skipRetryCtx: RetryHookContext = {
              ...hookCtx,
              delayMs: retryDecision.rejectedDelayMs,
              reason: "retry_after_too_large",
              status: response.status
            };
            config.hooks.onRetry?.(skipRetryCtx);
          }
          const apiError = new BsuirApiError(
            `BSUIR API returned HTTP ${String(response.status)} for ${method} ${path}`,
            response.status,
            endpoint,
            errorBody
          );
          const errorCtx: ErrorHookContext = {
            ...hookCtx,
            durationMs: Date.now() - startedAt,
            error: apiError
          };
          config.hooks.onError?.(errorCtx);
          throw apiError;
        }

        const parsed = (await parseBody(response, config.maxResponseBytes)) as T;
        const responseCtx: ResponseHookContext = {
          ...hookCtx,
          status: response.status,
          durationMs: Date.now() - startedAt,
          fromCache: false
        };
        config.hooks.onResponse?.(responseCtx);
        return parsed;
      } catch (error: unknown) {
        if (error instanceof BsuirApiError) {
          throw error;
        }

        if (error instanceof BsuirResponsePayloadTooLargeError) {
          throw error;
        }

        if (isAbortError(error)) {
          if (options.signal?.aborted || config.signal?.aborted) {
            const abortCtx: ErrorHookContext = {
              ...hookCtx,
              durationMs: Date.now() - startedAt,
              error
            };
            config.hooks.onError?.(abortCtx);
            throw error;
          }
          const timeoutError = new BsuirTimeoutError(
            `Request timed out after ${String(config.timeoutMs)}ms: ${path}`,
            endpoint,
            config.timeoutMs,
            error
          );
          const timeoutCtx: ErrorHookContext = {
            ...hookCtx,
            durationMs: Date.now() - startedAt,
            error: timeoutError
          };
          config.hooks.onError?.(timeoutCtx);
          throw timeoutError;
        }

        if (attempt < maxRetries) {
          const delayMs = getRetryDelayMs(config, attempt);
          const retryCtx: RetryHookContext = {
            ...hookCtx,
            delayMs,
            reason: "network_error",
            status: undefined
          };
          config.hooks.onRetry?.(retryCtx);
          await sleep(delayMs);
          continue;
        }

        const networkError = new BsuirNetworkError(
          `Network error while requesting ${path}`,
          endpoint,
          error
        );
        const networkErrorCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error: networkError
        };
        config.hooks.onError?.(networkErrorCtx);
        throw networkError;
      }
    }

    throw new BsuirNetworkError(`Unexpected retry loop termination for ${path}`, endpoint, null);
  };

  const requestAndMaybeCache = (): Promise<T> =>
    performRequest().then((payload) => {
      if (canWriteToCache) {
        setCache(config, ensureRequestKey(), payload);
      }
      return payload;
    });

  if (canUseDedup) {
    const key = ensureRequestKey();
    const inFlight = config.inFlightRequests.get(key);
    if (inFlight) {
      return (await inFlight) as T;
    }

    const inFlightPromise: Promise<T> = requestAndMaybeCache()
      .finally(() => {
        config.inFlightRequests.delete(key);
      });
    config.inFlightRequests.set(key, inFlightPromise);
    return await inFlightPromise;
  }

  return await requestAndMaybeCache();
}
