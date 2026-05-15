import type { InternalClientConfig } from "../types";

/** HTTP status codes retriable by the request pipeline. */
export const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Delays execution for a specified number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter || retryAfter.trim().length === 0) {
    return null;
  }

  // Try parsing as seconds (RFC 7231: numeric-value).
  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    // Validate it's actually numeric format, not a date string starting with a digit.
    if (/^\d+(\.\d+)?$/.test(retryAfter.trim())) {
      return Math.floor(asSeconds * 1000);
    }
  }

  // Try parsing as HTTP date format (RFC 7231: http-date).
  const dateValue = Date.parse(retryAfter);
  if (Number.isFinite(dateValue)) {
    const delayMs = dateValue - Date.now();
    // Only accept if date is in the future.
    if (delayMs > 0) {
      return Math.min(delayMs, 86_400_000); // Cap at 24 hours to prevent unreasonably long wait
    }
  }

  return null;
}

/**
 * Computes the retry delay in milliseconds for the given attempt number.
 * Applies exponential backoff capped at `retryMaxDelayMs`, with optional jitter.
 * If a valid `Retry-After` header value is provided, it takes precedence.
 */
export function getRetryDelayMs(
  config: Readonly<InternalClientConfig>,
  attempt: number,
  retryAfter?: string | null,
): number {
  const retryAfterMs = retryAfter !== undefined ? parseRetryAfterMs(retryAfter) : null;
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, config.retryMaxDelayMs);
  }

  const backoff = config.retryDelayMs * Math.pow(2, attempt);
  const baseDelay = Math.min(backoff, config.retryMaxDelayMs);

  if (!config.retryJitter) {
    return Math.floor(baseDelay);
  }

  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.floor(baseDelay * jitterFactor);
}
