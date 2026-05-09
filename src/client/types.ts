export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;
export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CacheOptions {
  /**
   * Cache TTL for successful GET responses, in milliseconds.
   */
  ttlMs: number;
  /**
   * Maximum number of cached entries kept in memory.
   */
  maxEntries?: number;
}

export interface RequestHookContext {
  method: RequestMethod;
  path: string;
  endpoint: string;
  attempt: number;
  maxAttempts: number;
  query: QueryParams | undefined;
}

export interface RetryHookContext extends RequestHookContext {
  delayMs: number;
  reason: "http_status" | "network_error";
  status: number | undefined;
}

export interface ResponseHookContext extends RequestHookContext {
  status: number;
  durationMs: number;
  fromCache: boolean;
}

export interface ErrorHookContext extends RequestHookContext {
  durationMs: number;
  error: unknown;
}

export interface ClientHooks {
  onRequest?: (context: RequestHookContext) => void;
  onRetry?: (context: RetryHookContext) => void;
  onResponse?: (context: ResponseHookContext) => void;
  onError?: (context: ErrorHookContext) => void;
}

/**
 * Low-level HTTP request options used by internal request pipeline.
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
  /**
   * HTTP method. Defaults to `GET`.
   */
  method?: RequestMethod | undefined;
  /**
   * JSON body payload for mutating requests.
   */
  body?: unknown;
  /**
   * Additional request headers.
   */
  headers?: HeadersInit | undefined;
}

/**
 * Options accepted by `createBsuirClient`.
 */
export interface BsuirClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Optional global signal to cancel all client requests. */
  signal?: AbortSignal;
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
  /** In-memory cache configuration for successful GET responses. */
  cache?: CacheOptions;
  /** Enables in-flight GET request deduplication by URL. */
  dedupeInFlight?: boolean;
  /** Enables runtime validation of API response shapes. */
  validateResponses?: boolean;
  /** Lifecycle hooks for request/response/retry/error events. */
  hooks?: ClientHooks;
  /**
   * Force raw API payload for schedule endpoints by default.
   * This changes return types for `schedule.getGroup/getEmployee` when `raw` is omitted.
   *
   * Per-call `raw` option always takes precedence over this default.
   *
   * @example
   * ```ts
   * const client = createBsuirClient({ defaultRaw: true });
   * // Returns ScheduleResponse (raw)
   * const raw = await client.schedule.getGroup("053503");
   * // Returns NormalizedScheduleResponse (per-call override)
   * const normalized = await client.schedule.getGroup("053503", { raw: false });
   * ```
   */
  defaultRaw?: boolean;
}

export interface InternalClientConfig<TRawDefault extends boolean = boolean> {
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  signal: AbortSignal | undefined;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
  retryJitter: boolean;
  userAgent: string | undefined;
  cacheTtlMs: number | undefined;
  cacheMaxEntries: number;
  dedupeInFlight: boolean;
  validateResponses: boolean;
  hooks: ClientHooks;
  responseCache: Map<string, { expiresAt: number; value: unknown; accessedAt: number }>;
  inFlightRequests: Map<string, Promise<unknown>>;
  defaultRaw: TRawDefault;
}
