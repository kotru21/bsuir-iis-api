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
  const requestSignal = mergeSignals(options.signal, config.timeoutMs);
  const headers = new Headers({
    Accept: "application/json"
  });

  if (config.userAgent) {
    headers.set("User-Agent", config.userAgent);
  }

  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    try {
      const response = await config.fetchImpl(endpoint, {
        method: "GET",
        headers,
        signal: requestSignal
      });

      if (!response.ok) {
        const errorBody = await parseBody(response);
        if (attempt < config.retries && RETRIABLE_STATUS_CODES.has(response.status)) {
          await sleep(config.retryDelayMs * (attempt + 1));
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
        await sleep(config.retryDelayMs * (attempt + 1));
        continue;
      }

      throw new BsuirNetworkError(`Network error while requesting ${path}`, endpoint, error);
    }
  }

  throw new BsuirNetworkError(`Network error while requesting ${path}`, endpoint, null);
}
