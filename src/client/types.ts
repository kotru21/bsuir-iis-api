export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  query?: QueryParams | undefined;
  signal?: AbortSignal | undefined;
}

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
