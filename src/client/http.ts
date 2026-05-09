import { BsuirApiError, BsuirNetworkError, BsuirTimeoutError } from "./errors";
import { mergeSignals } from "./mergeSignals";
import type { InternalClientConfig, QueryParams, RequestMethod, RequestOptions } from "./types";
import { isAbortError } from "../utils/guards";

const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
type AbortSignalConstructor = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryReadCache(config: InternalClientConfig, key: string): unknown {
  const entry = config.responseCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    config.responseCache.delete(key);
    return undefined;
  }
  // Update accessedAt for LRU eviction
  entry.accessedAt = Date.now();
  return entry.value;
}

function setCache(config: InternalClientConfig, key: string, value: unknown): void {
  if (config.cacheTtlMs === undefined) {
    return;
  }
  const now = Date.now();
  config.responseCache.set(key, {
    value,
    expiresAt: now + config.cacheTtlMs,
    accessedAt: now
  });

  // O(n) linear scan: remove expired entries first to minimize evictions
  for (const [k, v] of config.responseCache) {
    if (v.expiresAt <= now) {
      config.responseCache.delete(k);
    }
  }

  // O(n) linear scan for LRU eviction — acceptable for default maxEntries ≤ 200
  while (config.responseCache.size > config.cacheMaxEntries) {
    let lruKey: string | undefined;
    let lruTime = Number.POSITIVE_INFINITY;

    for (const [k, v] of config.responseCache) {
      if (v.accessedAt < lruTime) {
        lruTime = v.accessedAt;
        lruKey = k;
      }
    }

    if (lruKey === undefined) {
      break;
    }
    config.responseCache.delete(lruKey);
  }
}

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

  const AbortSignalCtor = AbortSignal as AbortSignalConstructor;
  if (typeof AbortSignalCtor.any === "function") {
    return AbortSignalCtor.any([first, second]);
  }

  const controller = new AbortController();
  const onAbort = (): void => {
    first.removeEventListener("abort", onAbort);
    second.removeEventListener("abort", onAbort);
    controller.abort();
  };

  if (first.aborted || second.aborted) {
    onAbort();
    return controller.signal;
  }

  first.addEventListener("abort", onAbort, { once: true });
  second.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter || retryAfter.trim().length === 0) {
    return null;
  }

  // Try parsing as seconds (RFC 7231: numeric-value)
  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    // Validate it's actually numeric format, not a date string starting with a digit
    if (/^\d+(\.\d+)?$/.test(retryAfter.trim())) {
      return Math.floor(asSeconds * 1000);
    }
  }

  // Try parsing as HTTP date format (RFC 7231: http-date)
  const dateValue = Date.parse(retryAfter);
  if (Number.isFinite(dateValue)) {
    const delayMs = dateValue - Date.now();
    // Only accept if date is in the future
    if (delayMs > 0) {
      return Math.min(delayMs, 86_400_000); // Cap at 24 hours to prevent unreasonably long waits
    }
  }

  return null;
}

function getRetryDelayMs(
  config: InternalClientConfig,
  attempt: number,
  retryAfterHeader?: string | null
): number {
  const retryAfterDelay = parseRetryAfterMs(retryAfterHeader ?? null);
  if (retryAfterDelay !== null) {
    return Math.min(retryAfterDelay, config.retryMaxDelayMs);
  }

  const exponent = Math.max(0, attempt);
  const baseDelay = Math.min(config.retryDelayMs * 2 ** exponent, config.retryMaxDelayMs);
  if (!config.retryJitter) {
    return baseDelay;
  }

  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.floor(baseDelay * jitterFactor);
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const declaredJson = contentType.includes("application/json");
  const text = await response.text();
  if (text.length === 0) {
    if (declaredJson) {
      throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
    }
    return "";
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (declaredJson) {
      throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
    }
    return text;
  }
}

function baseHookContext(
  method: RequestMethod,
  path: string,
  endpoint: string,
  attempt: number,
  maxAttempts: number,
  query: QueryParams | undefined
) {
  return {
    method,
    path,
    endpoint,
    attempt,
    maxAttempts,
    query
  };
}

export async function requestJson<T>(
  config: InternalClientConfig,
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
  const canUseCaching = config.cacheTtlMs !== undefined && method === "GET" && !options.signal;
  const canUseDedup = config.dedupeInFlight && method === "GET" && !options.signal;

  if (canUseCaching) {
    const cached = tryReadCache(config, cacheKey);
    if (cached !== undefined) {
      config.hooks.onResponse?.({
        ...baseHookContext(method, path, endpoint, 1, maxAttempts, options.query),
        status: 200,
        durationMs: 0,
        fromCache: true
      });
      return cached as T;
    }
  }

  const performRequest = async (): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const attemptNumber = attempt + 1;
      const startedAt = Date.now();
      config.hooks.onRequest?.(
        baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query)
      );
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
          const errorBody = await parseBody(response);
          if (attempt < maxRetries && RETRIABLE_STATUS_CODES.has(response.status)) {
            const delayMs = getRetryDelayMs(config, attempt, response.headers.get("retry-after"));
            config.hooks.onRetry?.({
              ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
              delayMs,
              reason: "http_status",
              status: response.status
            });
            await sleep(delayMs);
            continue;
          }
          const apiError = new BsuirApiError(
            `BSUIR API returned HTTP ${String(response.status)} for ${method} ${path}`,
            response.status,
            endpoint,
            errorBody
          );
          config.hooks.onError?.({
            ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
            durationMs: Date.now() - startedAt,
            error: apiError
          });
          throw apiError;
        }

        const parsed = (await parseBody(response)) as T;
        config.hooks.onResponse?.({
          ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
          status: response.status,
          durationMs: Date.now() - startedAt,
          fromCache: false
        });
        return parsed;
      } catch (error) {
        if (error instanceof BsuirApiError) {
          throw error;
        }

        if (isAbortError(error)) {
          if (options.signal?.aborted || config.signal?.aborted) {
            config.hooks.onError?.({
              ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
              durationMs: Date.now() - startedAt,
              error
            });
            throw error;
          }
          const timeoutError = new BsuirTimeoutError(
            `Request timed out after ${String(config.timeoutMs)}ms: ${path}`,
            endpoint,
            config.timeoutMs
          );
          config.hooks.onError?.({
            ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
            durationMs: Date.now() - startedAt,
            error: timeoutError
          });
          throw timeoutError;
        }

        if (attempt < maxRetries) {
          const delayMs = getRetryDelayMs(config, attempt);
          config.hooks.onRetry?.({
            ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
            delayMs,
            reason: "network_error",
            status: undefined
          });
          await sleep(delayMs);
          continue;
        }

        const networkError = new BsuirNetworkError(
          `Network error while requesting ${path}`,
          endpoint,
          error
        );
        config.hooks.onError?.({
          ...baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query),
          durationMs: Date.now() - startedAt,
          error: networkError
        });
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

    const inFlightPromise = performRequest()
      .then((payload) => {
        if (canUseCaching) {
          setCache(config, cacheKey, payload);
        }
        return payload;
      })
      .finally(() => {
        config.inFlightRequests.delete(cacheKey);
      });
    config.inFlightRequests.set(cacheKey, inFlightPromise as Promise<unknown>);
    return await inFlightPromise;
  }

  const payload = await performRequest();
  if (canUseCaching) {
    setCache(config, cacheKey, payload);
  }
  return payload;
}
