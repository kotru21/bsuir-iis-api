import type { InternalClientConfig } from "../types";

/** HTTP status codes retriable by the request pipeline. */
export const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_ACCEPTED_RETRY_AFTER_MS = 60_000;
// Hard internal cap applied to any Retry-After value (numeric or date-based) before
// the higher-level decision logic compares it against MAX_ACCEPTED_RETRY_AFTER_MS.
// Prevents arithmetic overflow or unreasonably large delays from hostile/misconfigured
// upstreams from being propagated further.
const RETRY_AFTER_INTERNAL_CAP_MS = 86_400_000;

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
  if (
    Number.isFinite(asSeconds) &&
    asSeconds >= 0 && // Validate it's actually numeric format, not a date string starting with a digit.
    /^\d+(\.\d+)?$/.test(retryAfter.trim())
  ) {
    const ms = Math.floor(asSeconds * 1000);
    return Math.min(ms, RETRY_AFTER_INTERNAL_CAP_MS);
  }

  // Try parsing as HTTP date format (RFC 7231: http-date).
  const dateValue = Date.parse(retryAfter);
  if (Number.isFinite(dateValue)) {
    const delayMs = dateValue - Date.now();
    // Only accept if date is in the future.
    if (delayMs > 0) {
      return Math.min(delayMs, RETRY_AFTER_INTERNAL_CAP_MS);
    }
  }

  return null;
}

function getBackoffDelayMs(config: Readonly<InternalClientConfig>, attempt: number): number {
  const exponent = Math.max(0, attempt);
  const baseDelay = Math.min(config.retryDelayMs * 2 ** exponent, config.retryMaxDelayMs);
  if (!config.retryJitter) {
    return baseDelay;
  }
  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.floor(baseDelay * jitterFactor);
}

/** Whether the current attempt should retry, and after how long. */
export type RetryDecision =
  | { retryable: true; delayMs: number }
  | { retryable: false; rejectedDelayMs: number };

/**
 * Calculates retry behavior for the current attempt.
 *
 * If server-provided `Retry-After` exceeds a sane safety bound, retry is rejected
 * to avoid long caller stalls caused by hostile or misconfigured upstreams.
 */
export function getRetryDecision(
  config: Readonly<InternalClientConfig>,
  attempt: number,
  retryAfterHeader?: string | null
): RetryDecision {
  const retryAfterDelay = parseRetryAfterMs(retryAfterHeader ?? null);
  if (retryAfterDelay !== null) {
    if (retryAfterDelay > MAX_ACCEPTED_RETRY_AFTER_MS) {
      return { retryable: false, rejectedDelayMs: retryAfterDelay };
    }
    return { retryable: true, delayMs: Math.min(retryAfterDelay, config.retryMaxDelayMs) };
  }
  return { retryable: true, delayMs: getBackoffDelayMs(config, attempt) };
}

/**
 * Calculates retry delay using `Retry-After` when present, otherwise exponential backoff.
 */
export function getRetryDelayMs(
  config: Readonly<InternalClientConfig>,
  attempt: number,
  retryAfterHeader?: string | null
): number {
  const decision = getRetryDecision(config, attempt, retryAfterHeader);
  if (decision.retryable) {
    return decision.delayMs;
  }
  return getBackoffDelayMs(config, attempt);
}
