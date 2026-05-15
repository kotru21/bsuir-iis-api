import { BsuirApiError, BsuirNetworkError, BsuirTimeoutError } from "../errors";
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
import { getRetryDelayMs, RETRIABLE_STATUS_CODES, sleep } from "./retry";
import { buildUrl } from "./url";

function combineAbortSignals(
  first: AbortSignal | undefined,
  second: AbortSignal | undefined
): AbortSignal | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  // Delegate to mergeSignals for consistent signal combination logic.
  return mergeSignals([first, second]);
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

  const cacheKey = endpoint;
  // Caching and dedup are disabled when a per-call signal is provided (caller manages lifecycle)
  // OR when a global client signal is already aborted — stale data must not be served after abort.
  const hasActiveSignal = options.signal != null || config.signal?.aborted === true;
  const canUseCaching = config.cacheTtlMs !== undefined && method === "GET" && !hasActiveSignal;
  const canUseDedup = config.dedupeInFlight && method === "GET" && !hasActiveSignal;

  if (canUseCaching) {
    const cached = tryReadCache(config, cacheKey);
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

      const externalSignal = combineAbortSignals(options.signal, config.signal);
      const requestSignal = mergeSignals(externalSignal, config.timeoutMs);

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
            const delayMs = getRetryDelayMs(config, attempt, response.headers.get("retry-after"));
            const retryCtx: RetryHookContext = {
              ...hookCtx,
              delayMs,
              reason: "http_status",
              status: response.status
            };
            config.hooks.onRetry?.(retryCtx);
            await sleep(delayMs);
            continue;
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

  if (canUseDedup) {
    const inFlight = config.inFlightRequests.get(cacheKey);
    if (inFlight) {
      return (await inFlight) as T;
    }

    const inFlightPromise: Promise<T> = performRequest()
      .then((payload) => {
        if (canUseCaching) {
          setCache(config, cacheKey, payload);
        }
        return payload;
      })
      .finally(() => {
        config.inFlightRequests.delete(cacheKey);
      });
    config.inFlightRequests.set(cacheKey, inFlightPromise);
    return await inFlightPromise;
  }

  const payload = await performRequest();
  if (canUseCaching) {
    setCache(config, cacheKey, payload);
  }
  return payload;
}
