import { BsuirApiError, BsuirNetworkError, BsuirTimeoutError } from "./errors";
import type { InternalClientConfig, QueryParams, RequestOptions } from "./types";
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

function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([AbortSignal.timeout(timeoutMs), signal].filter(Boolean) as AbortSignal[]);
  }

  if (signal) {
    return signal;
  }

  return AbortSignal.timeout(timeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const asSeconds = Number(retryAfter);
  if (!Number.isNaN(asSeconds)) {
    return Math.max(0, Math.floor(asSeconds * 1000));
  }

  const dateValue = Date.parse(retryAfter);
  if (!Number.isNaN(dateValue)) {
    return Math.max(0, dateValue - Date.now());
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
  if (!contentType.includes("application/json")) {
    return response.text();
  }

  try {
    return await response.json();
  } catch {
    throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
  }
}

export async function requestJson<T>(
  config: InternalClientConfig,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const endpoint = buildUrl(config.baseUrl, path, options.query);
  const headers = new Headers({
    Accept: "application/json"
  });

  if (config.userAgent) {
    headers.set("User-Agent", config.userAgent);
  }

  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    const requestSignal = mergeSignals(options.signal, config.timeoutMs);
    try {
      const response = await config.fetchImpl(endpoint, {
        method: "GET",
        headers,
        signal: requestSignal
      });

      if (!response.ok) {
        const errorBody = await parseBody(response);
        if (attempt < config.retries && RETRIABLE_STATUS_CODES.has(response.status)) {
          const delayMs = getRetryDelayMs(config, attempt, response.headers.get("retry-after"));
          await sleep(delayMs);
          continue;
        }
        throw new BsuirApiError(
          `BSUIR API returned HTTP ${response.status} for ${path}`,
          response.status,
          endpoint,
          errorBody
        );
      }

      return (await parseBody(response)) as T;
    } catch (error) {
      if (error instanceof BsuirApiError) {
        throw error;
      }

      if (isAbortError(error)) {
        if (options.signal?.aborted) {
          throw error;
        }
        throw new BsuirTimeoutError(
          `Request timed out after ${config.timeoutMs}ms: ${path}`,
          endpoint,
          config.timeoutMs
        );
      }

      if (attempt < config.retries) {
        const delayMs = getRetryDelayMs(config, attempt);
        await sleep(delayMs);
        continue;
      }

      throw new BsuirNetworkError(`Network error while requesting ${path}`, endpoint, error);
    }
  }

  throw new BsuirNetworkError(`Network error while requesting ${path}`, endpoint, null);
}
