import { BsuirApiError, BsuirNetworkError, BsuirTimeoutError } from "./errors";
import { mergeSignals } from "./mergeSignals";
import type {
  ErrorHookContext,
  InternalClientConfig,
  QueryParams,
  RequestHookContext,
  RequestMethod,
  RequestOptions,
  ResponseHookContext,
  RetryHookContext,
} from "./types";
import { isAbortError } from "../utils/guards";

const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

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

function tryReadCache(config: Readonly<InternalClientConfig>, key: string): unknown {
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

function setCache(config: Readonly<InternalClientConfig>, key: string, value: unknown): void {
  if (config.cacheTtlMs === undefined) {
    return;
  }
  const now = Date.now();
  config.responseCache.set(key, {
    value,
    expiresAt: now + config.cacheTtlMs,
    accessedAt: now,
  });

  // Only trigger cleanup when cache is approaching capacity (>90%) to avoid O(n) scan on every set
  const cleanupThreshold = config.cacheMaxEntries * 0.9;
  if (config.responseCache.size <= cleanupThreshold) {
    return;
  }

  // Remove expired entries first
  for (const [k, v] of config.responseCache) {
    if (v.expiresAt <= now) {
      config.responseCache.delete(k);
    }
  }

  // Apply pseudo-LRU eviction if still over capacity.
  // Map preserves insertion order; the first key is the oldest-inserted entry,
  // which serves as a fast O(1) approximation of LRU without a separate bookkeeping structure.
  while (config.responseCache.size > config.cacheMaxEntries) {
    const firstKey = config.responseCache.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    config.responseCache.delete(firstKey);
  }
}

function combineAbortSignals(
  first: AbortSignal | undefined,
  second: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  // Delegate to mergeSignals for consistent signal combination logic
  return mergeSignals([first, second]);
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
  config: Readonly<InternalClientConfig>,
  attempt: number,
  retryAfterHeader?: string | null,
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
  query: QueryParams | undefined,
): RequestHookContext {
  return {
    method,
    path,
    endpoint,
    attempt,
    maxAttempts,
    query,
  };
}

export async function requestJson<T>(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const endpoint = buildUrl(config.baseUrl, path, options.query);
  const method = options.method ?? "GET";
  const requestCanRetry = method === "GET";
  const maxRetries = requestCanRetry ? config.retries : 0;
  const maxAttempts = maxRetries + 1;
  const headers = new Headers({
    Accept: "application/json",
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
      const cacheHitCtx: ResponseHookContext = {
        ...baseHookContext(method, path, endpoint, 1, maxAttempts, options.query),
        status: 200,
        durationMs: 0,
        fromCache: true,
      };
      config.hooks.onResponse?.(cacheHitCtx);
      return cached as T;
    }
  }

  const performRequest = async (): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const attemptNumber = attempt + 1;
      const startedAt = Date.now();
      const hookCtx = baseHookContext(method, path, endpoint, attemptNumber, maxAttempts, options.query);

      config.hooks.onRequest?.(hookCtx);

      const externalSignal = combineAbortSignals(options.signal, config.signal);
      const requestSignal = mergeSignals(externalSignal, config.timeoutMs);

      try {
        const requestInit: RequestInit = {
          method,
          headers,
          signal: requestSignal,
        };
        if (body !== undefined) {
          requestInit.body = body;
        }

        const response = await config.fetchImpl(endpoint, requestInit);

        if (!response.ok) {
          const errorBody = await parseBody(response);
          if (attempt < maxRetries && RETRIABLE_STATUS_CODES.has(response.status)) {
            const delayMs = getRetryDelayMs(config, attempt, response.headers.get("retry-after"));
            const retryCtx: RetryHookContext = {
              ...hookCtx,
              delayMs,
              reason: "http_status",
              status: response.status,
            };
            config.hooks.onRetry?.(retryCtx);
            await sleep(delayMs);
            continue;
          }
          const apiError = new BsuirApiError(
            `BSUIR API returned HTTP ${String(response.status)} for ${method} ${path}`,
            response.status,
            endpoint,
            errorBody,
          );
          const errorCtx: ErrorHookContext = {
            ...hookCtx,
            durationMs: Date.now() - startedAt,
            error: apiError,
          };
          config.hooks.onError?.(errorCtx);
          throw apiError;
        }

        const parsed = (await parseBody(response)) as T;
        const responseCtx: ResponseHookContext = {
          ...hookCtx,
          status: response.status,
          durationMs: Date.now() - startedAt,
          fromCache: false,
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
              error,
            };
            config.hooks.onError?.(abortCtx);
            throw error;
          }
          const timeoutError = new BsuirTimeoutError(
            `Request timed out after ${String(config.timeoutMs)}ms: ${path}`,
            endpoint,
            config.timeoutMs,
            error,
          );
          const timeoutCtx: ErrorHookContext = {
            ...hookCtx,
            durationMs: Date.now() - startedAt,
            error: timeoutError,
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
            status: undefined,
          };
          config.hooks.onRetry?.(retryCtx);
          await sleep(delayMs);
          continue;
        }

        const networkError = new BsuirNetworkError(
          `Network error while requesting ${path}`,
          endpoint,
          error,
        );
        const networkErrorCtx: ErrorHookContext = {
          ...hookCtx,
          durationMs: Date.now() - startedAt,
          error: networkError,
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
