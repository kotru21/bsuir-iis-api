export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;
export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CacheOptions {
  /**
   * Cache TTL for successful GET responses, in milliseconds.
   *
   * After this duration has elapsed the cached entry is considered stale and
   * the next request will hit the network again.
   *
   * @example
   * ```ts
   * // Cache responses for 5 minutes
   * const client = createBsuirClient({ cache: { ttlMs: 5 * 60 * 1000 } });
   * ```
   */
  ttlMs: number;
  /**
   * Maximum number of entries kept in the in-memory cache.
   *
   * When the limit is exceeded the least-recently-used (LRU) entries are evicted
   * first. Expired entries are always removed before LRU eviction runs.
   *
   * @default 200
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
  /**
   * Base URL of the BSUIR IIS API.
   *
   * @default "https://iis.bsuir.by/api/v1"
   */
  baseUrl?: string;
  /**
   * Custom `fetch` implementation. Useful for environments where the global
   * `fetch` is unavailable (older Node.js versions) or when you want to wrap
   * requests with a proxy, MSW handler, or test mock.
   *
   * @default globalThis.fetch
   * @example
   * ```ts
   * import nodeFetch from "node-fetch";
   * const client = createBsuirClient({ fetch: nodeFetch as typeof fetch });
   * ```
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Global `AbortSignal` that cancels **all** requests made by this client
   * instance. Per-call signals are combined with this one.
   *
   * Note: caching and in-flight deduplication are disabled for requests that
   * carry a signal (per-call or global) to prevent stale data from being
   * returned after cancellation.
   */
  signal?: AbortSignal;
  /**
   * Request timeout per attempt, in milliseconds.
   *
   * If a single fetch attempt does not complete within this window it is
   * aborted and a `BsuirTimeoutError` is thrown (or the request is retried
   * if retries remain).
   *
   * @default 10_000 (10 seconds)
   */
  timeoutMs?: number;
  /**
   * Number of additional retry attempts for retriable GET failures (HTTP 429,
   * 500, 502, 503, 504 and network errors). Set to `0` to disable retries.
   *
   * @default 1
   */
  retries?: number;
  /**
   * Base delay before the first retry, in milliseconds. Subsequent retries use
   * exponential backoff: `retryDelayMs * 2^attempt`, capped by `retryMaxDelayMs`.
   *
   * @default 300
   */
  retryDelayMs?: number;
  /**
   * Upper bound for the retry delay after backoff, in milliseconds.
   *
   * @default 3_000 (3 seconds)
   */
  retryMaxDelayMs?: number;
  /**
   * When `true`, a random jitter factor (±25 %) is applied to each retry delay
   * to avoid synchronized retries from multiple clients hitting the API at the
   * same time.
   *
   * @default true
   */
  retryJitter?: boolean;
  /**
   * Value sent as the `User-Agent` request header. Mainly useful in Node.js
   * environments where servers can log the client identity.
   *
   * @example
   * ```ts
   * const client = createBsuirClient({ userAgent: "my-app/1.0.0" });
   * ```
   */
  userAgent?: string;
  /**
   * In-memory response cache configuration for successful GET requests.
   *
   * When configured, responses are stored in a `Map` keyed by the full request
   * URL. Cache hits skip the network entirely and fire `onResponse` with
   * `fromCache: true`. The cache uses a true LRU eviction policy — the
   * least-recently-*read* entry is evicted first when `maxEntries` is exceeded.
   *
   * Caching is automatically skipped for requests that carry an `AbortSignal`
   * (per-call or global) to prevent serving stale data after cancellation.
   *
   * @example
   * ```ts
   * // Cache for 5 minutes, keep at most 500 entries
   * const client = createBsuirClient({
   *   cache: { ttlMs: 5 * 60 * 1000, maxEntries: 500 },
   * });
   * ```
   */
  cache?: CacheOptions;
  /**
   * Enables in-flight GET request deduplication by full URL.
   *
   * When two identical GET requests are made concurrently, only the first one
   * hits the network; the second one awaits the same `Promise`. This prevents
   * duplicate API calls in scenarios like parallel component rendering.
   *
   * Disabled automatically when the request carries an `AbortSignal`.
   *
   * @default true
   */
  dedupeInFlight?: boolean;
  /**
   * Enables runtime shape validation of API responses.
   *
   * When `true`, each response is checked against the expected TypeScript type
   * at runtime. An `BsuirApiError` is thrown if the payload does not match,
   * which makes integration issues with the upstream API visible immediately
   * instead of causing silent type-cast bugs later.
   *
   * **Recommended to enable during development and in test environments.**
   * Can be left `false` in production for a small performance gain.
   *
   * @default false
   *
   * @example
   * ```ts
   * // Enable only in non-production environments
   * const client = createBsuirClient({
   *   validateResponses: process.env.NODE_ENV !== "production",
   * });
   * ```
   */
  validateResponses?: boolean;
  /**
   * Lifecycle hooks called at various stages of the request pipeline.
   *
   * Useful for logging, metrics collection, or custom error reporting.
   *
   * @example
   * ```ts
   * const client = createBsuirClient({
   *   hooks: {
   *     onRequest: ({ method, path }) => console.log(`→ ${method} ${path}`),
   *     onResponse: ({ path, durationMs, fromCache }) =>
   *       console.log(`← ${path} ${durationMs}ms${fromCache ? " (cache)" : ""}`),
   *     onRetry: ({ path, attempt, reason }) =>
   *       console.warn(`↺ ${path} retry #${attempt} (${reason})`),
   *     onError: ({ path, error }) => console.error(`✗ ${path}`, error),
   *   },
   * });
   * ```
   */
  hooks?: ClientHooks;
  /**
   * Controls the default return type of `schedule.getGroup` and
   * `schedule.getEmployee` when the per-call `raw` option is omitted.
   *
   * - `false` (default) — returns `NormalizedScheduleResponse` with flattened
   *   `lessons`, `lessonsByDay`, `scheduleLessons`, and `examLessons` arrays.
   * - `true` — returns the raw `ScheduleResponse` exactly as received from the
   *   BSUIR IIS API.
   *
   * A per-call `raw` option always takes precedence over this default.
   *
   * @default false
   *
   * @example
   * ```ts
   * // Normalized (default):
   * const client = createBsuirClient();
   * const norm = await client.schedule.getGroup("053503"); // NormalizedScheduleResponse
   *
   * // Raw by default:
   * const rawClient = createBsuirClient({ defaultRaw: true });
   * const raw = await rawClient.schedule.getGroup("053503"); // ScheduleResponse
   *
   * // Per-call override (always wins):
   * const override = await client.schedule.getGroup("053503", { raw: true }); // ScheduleResponse
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
