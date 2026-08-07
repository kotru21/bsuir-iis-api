/** Primitive values accepted in request query maps. */
export type QueryValue = string | number | boolean | null | undefined;
/** Per-request cache mode for successful GET responses. */
export type RequestCacheMode = "default" | "no-store" | "reload";

/** Query string map passed to the HTTP layer. */
export type QueryParams = Record<string, QueryValue>;
/** HTTP methods supported by the SDK request pipeline. */
export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** In-memory GET response cache configuration. */
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
   * @defaultValue 200
   */
  maxEntries?: number;
}

/** Context passed to `hooks.onRequest` before each attempt. */
export interface RequestHookContext {
  method: RequestMethod;
  path: string;
  endpoint: string;
  attempt: number;
  maxAttempts: number;
  query: QueryParams | undefined;
}

/** Context passed to `hooks.onRetry` when a GET will be retried. */
export interface RetryHookContext extends RequestHookContext {
  delayMs: number;
  reason: "http_status" | "network_error" | "retry_after_too_large";
  status: number | undefined;
}

/** Context passed to `hooks.onResponse` after a successful parse. */
export interface ResponseHookContext extends RequestHookContext {
  status: number;
  durationMs: number;
  fromCache: boolean;
}

/** Context passed to `hooks.onError` when a request fails. */
export interface ErrorHookContext extends RequestHookContext {
  durationMs: number;
  error: unknown;
}

/**
 * Optional observability hooks for the HTTP pipeline.
 *
 * Hook exceptions are caught and discarded: an observability callback must
 * never break the request, trigger a retry, or mask the real outcome.
 */
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
  /**
   * Per-request cache mode for successful GET requests.
   *
   * - `"default"`: read from cache and write to cache.
   * - `"no-store"`: always bypass cache read/write.
   * - `"reload"`: bypass cache read, but write fresh response to cache.
   *
   * @defaultValue "default"
   */
  cache?: RequestCacheMode | undefined;
  /**
   * Optional response validator invoked for network responses before caching.
   * Used by internal modules to avoid repeated validation on cache hits.
   */
  responseValidator?: ((payload: unknown) => void) | undefined;
}

/**
 * Options accepted by `createBsuirClient`.
 */
export interface BsuirClientOptions {
  /**
   * Base URL of the BSUIR IIS API.
   *
   * @defaultValue "https://iis.bsuir.by/api/v1"
   */
  baseUrl?: string;
  /**
   * Allows using `http://` for `baseUrl`.
   *
   * Keep disabled unless you explicitly need local/non-TLS endpoints in tests.
   * When enabled, `http://` is allowed only for localhost/loopback hosts.
   *
   * @defaultValue false
   */
  allowInsecureHttp?: boolean;
  /**
   * Allowed hostnames for `baseUrl`.
   *
   * Requests are rejected if `baseUrl` hostname is not in this list.
   *
   * @defaultValue ["iis.bsuir.by"]
   */
  allowedBaseUrlHosts?: string[];
  /**
   * Custom `fetch` implementation. Useful for environments where the global
   * `fetch` is unavailable (older Node.js versions) or when you want to wrap
   * requests with a proxy, MSW handler, or test mock.
   *
   * @defaultValue globalThis.fetch
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
   * Note: caching is disabled only when the signal is already aborted at the
   * time the request is made. A live (non-aborted) global signal is fine:
   * caching remains enabled and in-flight deduplication can still be used.
   */
  signal?: AbortSignal;
  /**
   * Request timeout per attempt, in milliseconds.
   *
   * If a single fetch attempt does not complete within this window it is
   * aborted and a `BsuirTimeoutError` is thrown (or the request is retried
   * if retries remain).
   *
   * @defaultValue 10_000 (10 seconds)
   */
  timeoutMs?: number;
  /**
   * Number of additional retry attempts for retriable GET failures (HTTP 429,
   * 500, 502, 503, 504 and network errors). Set to `0` to disable retries.
   *
   * @defaultValue 1
   */
  retries?: number;
  /**
   * Base delay before the first retry, in milliseconds. Subsequent retries use
   * exponential backoff: `retryDelayMs * 2^attempt`, capped by `retryMaxDelayMs`.
   *
   * @defaultValue 300
   */
  retryDelayMs?: number;
  /**
   * Upper bound for the retry delay after backoff, in milliseconds.
   *
   * @defaultValue 3_000 (3 seconds)
   */
  retryMaxDelayMs?: number;
  /**
   * When `true`, a random jitter factor (±25 %) is applied to each retry delay
   * to avoid synchronized retries from multiple clients hitting the API at the
   * same time.
   *
   * @defaultValue true
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
   * `fromCache: true`. The cache uses `Map` insertion order as LRU:
   * cache reads "touch" entries and eviction removes oldest keys first.
   *
   * Caching is automatically skipped for requests where the relevant
   * `AbortSignal` (per-call or global) is already aborted, to prevent
   * serving stale data after cancellation.
   *
   * Caching is also automatically skipped when request headers include
   * credentials/private identity data such as `Authorization`, `Cookie`,
   * `Proxy-Authorization`, or `X-API-Key`.
   *
   * For server-side multi-tenant apps, prefer one client instance per identity
   * (per user/session/token) to avoid accidental data sharing.
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
   * Enables in-flight GET request deduplication by method + URL + headers.
   *
   * When two identical GET requests are made concurrently, only the first one
   * hits the network; the second one awaits the same `Promise`. This prevents
   * duplicate API calls in scenarios like parallel component rendering.
   *
   * Disabled automatically when the relevant `AbortSignal` is already aborted.
   * Also disabled for per-call signals, non-default cache modes, and requests
   * with private credential headers.
   *
   * @defaultValue false
   */
  dedupeInFlight?: boolean;
  /**
   * Maximum allowed response body size (in bytes) for a single request.
   *
   * Helps prevent excessive memory usage on unexpectedly large payloads.
   *
   * @defaultValue 5_000_000 (5 MB)
   */
  maxResponseBytes?: number;
  /**
   * Enables runtime shape validation of API responses.
   *
   * When `true`, a `BsuirResponseValidationError` is thrown if the payload does not
   * match the expected TypeScript shape, which makes integration issues with the
   * upstream API visible immediately instead of causing silent type-cast bugs later.
   *
   * Checked surfaces and depth:
   * - Schedule raw/normalized fetches: envelope plus field-level checks on every
   *   lesson item in `schedules` / `nextSchedules` / `exams`. Fields are validated
   *   when present — IIS may omit keys entirely on sparse payloads.
   * - Announcements lists: array/page envelope plus field-level item checks.
   * - Catalog lists: array of non-null objects (per-field catalog DTO checks are
   *   intentionally out of scope).
   * - Last-update payloads: `{ lastUpdateDate }` shape.
   *
   * Normalized schedule calls still apply a minimal envelope check even when this
   * flag is `false`, so normalization cannot crash on non-objects.
   *
   * **Recommended during development and in tests.** Leave `false` in production
   * if you prefer not to fail hard on quirky IIS payloads. Use
   * `createBsuirClient.strict()` as a shorthand for `{ validateResponses: true }`.
   *
   * @defaultValue false
   *
   * @example
   * ```ts
   * const client = createBsuirClient.strict({ timeoutMs: 10_000 });
   * // or:
   * const client2 = createBsuirClient({
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
}

/** Resolved internal client config after `createBsuirClient` option normalization. */
export interface InternalClientConfig {
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
  maxResponseBytes: number;
  validateResponses: boolean;
  hooks: ClientHooks;
  responseCache: Map<string, { expiresAt: number; value: unknown; status: number | undefined }>;
  inFlightRequests: Map<string, Promise<unknown>>;
}
