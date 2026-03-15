export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;

/**
 * Common request options shared by read-only API methods.
 */
export interface RequestOptions {
  /**
   * Query parameters appended to endpoint URL.
   */
  query?: QueryParams | undefined;
  /**
   * Optional signal to cancel request from the caller side.
   */
  signal?: AbortSignal | undefined;
}

/**
 * Options accepted by {@link createBsuirClient}.
 */
export interface BsuirClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Request timeout per attempt, in milliseconds. */
  timeoutMs?: number;
  /** Number of retry attempts for retriable GET failures. */
  retries?: number;
  /** Base retry delay before backoff, in milliseconds. */
  retryDelayMs?: number;
  /** Upper bound for retry delay, in milliseconds. */
  retryMaxDelayMs?: number;
  /** Enable jitter for retry backoff to avoid synchronized retries. */
  retryJitter?: boolean;
  /** Optional User-Agent header (used mainly in Node.js runtimes). */
  userAgent?: string;
  /** Force raw API payload for schedule endpoints by default. */
  defaultRaw?: boolean;
}

export interface InternalClientConfig {
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
  retryJitter: boolean;
  userAgent: string | undefined;
  defaultRaw: boolean;
}
