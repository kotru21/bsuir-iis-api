import type { HostPolicy } from "./hosts";

/** Primitive values accepted in request query maps. */
export type QueryValue = string | number | boolean | null | undefined;
/** Per-request cache mode for successful GET responses. */
export type RequestCacheMode = "default" | "no-store" | "reload";

/** Query string map passed to the HTTP layer. */
export type QueryParams = Record<string, QueryValue>;

/** Entry stored in the response cache. Treat as opaque: entries are deep-frozen on write. */
export interface ResponseCacheEntry {
  /** Deep-frozen parsed JSON payload. */
  readonly value: unknown;
  /** HTTP status of the original response; `undefined` for hand-populated entries. */
  readonly status: number | undefined;
  /** Epoch milliseconds when the entry becomes stale. */
  readonly expiresAt: number;
}

/**
 * Synchronous, Map-compatible storage backend for the response cache.
 *
 * Any object with Map semantics works: a plain `Map`, an `lru-cache` instance,
 * or a custom adapter. Requirements:
 * - Fully synchronous — the cache is read on the request hot path.
 * - `keys()` / `entries()` iterate oldest-first (insertion order), otherwise the
 *   SDK's LRU eviction removes the wrong entries (a plain `Map` guarantees this).
 *   Stores that iterate newest-first, such as `lru-cache`, must manage capacity
 *   themselves: set their own `max` no larger than `cache.maxEntries` so the SDK
 *   never needs to evict.
 *
 * Entries are written and read as frozen {@link ResponseCacheEntry} objects —
 * never mutate them. TTL and LRU bookkeeping stay in the SDK; the store is a
 * plain container. A store may be shared across client instances (cache keys are
 * `GET <full request URL>`; query parameters are sorted, so keys are stable).
 */
export interface CacheStore {
  get(key: string): ResponseCacheEntry | undefined;
  set(key: string, entry: ResponseCacheEntry): void;
  delete(key: string): void;
  keys(): Iterable<string>;
  entries(): Iterable<[string, ResponseCacheEntry]>;
  readonly size: number;
}

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
  /**
   * Custom storage backend for cached entries.
   *
   * Accepts any synchronous Map-compatible store (see {@link CacheStore}) —
   * for example a shared `Map` or an `lru-cache` instance — instead of the
   * SDK-managed per-client in-memory `Map`. The SDK still handles TTL, LRU
   * eviction, and entry freezing itself. For `lru-cache`, keep its `max` at or
   * below `maxEntries` (it iterates newest-first, see {@link CacheStore}).
   *
   * @defaultValue new Map() per client instance
   */
  store?: CacheStore;
}

/** Context passed to `hooks.onRequest` before each attempt. */
export interface RequestHookContext {
  /** Always `"GET"`: the SDK only reads from IIS. */
  method: "GET";
  path: string;
  endpoint: string;
  attempt: number;
  maxAttempts: number;
  query: Record<string, string | number | boolean | null | undefined> | undefined;
}

/** Context passed to `hooks.onRetry` when a GET will be retried. */
export interface RetryHookContext extends RequestHookContext {
  delayMs: number;
  reason: "http_status" | "network_error";
  status: number | undefined;
}

/** Context passed to `hooks.onResponse` after a successful parse. */
export interface ResponseHookContext extends RequestHookContext {
  status: number;
  durationMs: number;
  fromCache: boolean;
  /**
   * `true` when this call shared another caller's in-flight request
   * (`dedupeInFlight`) instead of sending its own; `durationMs` is then the time
   * it waited. Such calls fire no `onRequest` / `onRetry`.
   */
  deduplicated: boolean;
}

/** Context passed to `hooks.onError` when a request fails. */
export interface ErrorHookContext extends RequestHookContext {
  durationMs: number;
  error: unknown;
  /** `true` when this call was waiting on another caller's in-flight request. */
  deduplicated: boolean;
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
 * Low-level HTTP request options used by the internal request pipeline.
 *
 * @internal Not part of the public SDK surface — do not import from package root.
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
   * Optional response validator. Runs on network responses before they are cached,
   * and again on every cache hit so entries from a shared or hand-populated store
   * cannot bypass the current client's validation. A cache entry that fails it is
   * evicted, so the next call goes to the network instead of failing until the TTL.
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
   * Keep disabled unless you explicitly need a non-TLS endpoint you control: a local
   * mock server or a proxy on a private network (e.g. `http://bsuir-proxy:8080` inside
   * docker-compose). The host must still be listed in `allowedBaseUrlHosts`, and the
   * public IIS host (`iis.bsuir.by`) always requires HTTPS.
   *
   * @defaultValue false
   */
  allowInsecureHttp?: boolean;
  /**
   * Allowed hostnames for `baseUrl`.
   *
   * Requests are rejected if `baseUrl` hostname is not in this list. Any port is
   * accepted. A response redirected to a host outside the list (or from HTTPS to
   * plain HTTP without `allowInsecureHttp`) fails with `BsuirConfigurationError`.
   *
   * @defaultValue ["iis.bsuir.by"]
   */
  allowedBaseUrlHosts?: string[];
  /**
   * Custom `fetch` implementation, e.g. to route requests through a proxy agent,
   * add tracing, or use a test mock. Every supported runtime (Node.js 22.18 or newer
   * and modern browsers) has a global `fetch`, so this is optional.
   *
   * The SDK always calls it as a plain function (no `this`), so passing a native
   * method such as `window.fetch` directly is safe.
   *
   * @defaultValue globalThis.fetch
   * @example
   * ```ts
   * const client = createBsuirClient({
   *   fetch: async (input, init) => {
   *     console.time(String(input));
   *     try {
   *       return await fetch(input, init);
   *     } finally {
   *       console.timeEnd(String(input));
   *     }
   *   }
   * });
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
   * If a fetch attempt does not complete within this window it is aborted and
   * a `BsuirTimeoutError` is thrown immediately. Timeouts are **not** retried
   * (retries apply only to network errors and HTTP 429/5xx — see {@link retries}).
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
   * When configured, responses are stored in a `Map` keyed by the method plus the
   * full request URL. Cache hits skip the network entirely and fire `onResponse` with
   * `fromCache: true`. The cache uses `Map` insertion order as LRU:
   * cache reads "touch" entries and eviction removes oldest keys first.
   *
   * Caching is automatically skipped for requests where the relevant
   * `AbortSignal` (per-call or global) is already aborted, to prevent
   * serving stale data after cancellation.
   *
   * IIS read endpoints are public and the SDK sends no per-identity headers, so a
   * cache (or a shared `cache.store`) never mixes data between users.
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
   * Enables in-flight GET request deduplication by request URL.
   *
   * When two identical GET requests are made concurrently, only the first one
   * hits the network; the others wait for its response. This prevents duplicate
   * API calls in scenarios like parallel component rendering.
   *
   * Per-call signals are supported: a caller whose signal aborts stops waiting
   * (rejecting with its own abort reason) without affecting the others, and the
   * shared network request is cancelled only once **every** caller waiting for it
   * has aborted. Not used for non-default cache modes or already-aborted signals.
   *
   * Hooks: the shared request fires the usual events (`deduplicated: false`); each
   * caller that joined it gets its own `onResponse` / `onError` with
   * `deduplicated: true`.
   *
   * Deduplicated responses are shared between callers. Like every SDK result they
   * are **deep-frozen**, so one caller cannot mutate another caller's data.
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
   * Enables **deep** runtime shape validation of API responses.
   *
   * When `true`, a `BsuirResponseValidationError` is thrown if the payload does not
   * match the expected TypeScript shape, which makes integration issues with the
   * upstream API visible immediately instead of causing silent type-cast bugs later.
   *
   * Checked surfaces and depth (opt-in):
   * Every check comes from one schema per DTO, compile-time bound to the exported
   * interface, so strict mode validates exactly what the types promise:
   * - Schedule raw/normalized fetches: envelope DTOs (`employeeDto`, `studentGroupDto`)
   *   and every lesson in `schedules` / `nextSchedules` / `exams`, nested employees and
   *   student groups included. Fields are validated
   *   when present — IIS may omit keys entirely on sparse payloads. Lessons under a
   *   day key other than the six `WEEKDAYS` (e.g. `"Воскресенье"`) are rejected: they
   *   would be missing from the flattened lesson views.
   * - Announcements lists: array/page envelope plus field-level item checks.
   * - Catalog lists: every item field by field against its DTO (`Faculty`,
   *   `Auditory`, …).
   *
   * Independent of this flag, the SDK always applies lightweight **structural**
   * guards so return types stay honest (raw and normalized schedule paths)
   * and normalization cannot throw raw `TypeError` or silently empty a bad
   * envelope: catalog/announcement unwraps must be arrays; schedule day buckets
   * must be arrays (nullish → empty); `schedules` / `nextSchedules` must be
   * maps (object|null|absent); `exams` must be array|null|absent. Those guards
   * also throw `BsuirResponseValidationError`.
   *
   * **Recommended during development and in tests.** Leave `false` in production
   * if you prefer not to fail hard on quirky IIS lesson/item fields. Use
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

/** Outcome of a deduplicated request shared between callers. */
export interface SharedRequestResult {
  /** Deep-frozen payload. */
  value: unknown;
  /** HTTP status of the response (for the waiters' `onResponse`). */
  status: number | undefined;
}

/** One deduplicated network request and the callers waiting for it. */
export interface InFlightRequest {
  readonly result: Promise<SharedRequestResult>;
  /** Cancels the shared request; aborted only when the last waiter aborts. */
  readonly controller: AbortController;
  /** Callers still waiting for `result`. */
  waiters: number;
}

/** Resolved internal client config after `createBsuirClient` option normalization. */
export interface InternalClientConfig {
  baseUrl: string;
  /** Hosts/protocols the client may talk to; also applied to redirect targets. */
  hostPolicy: HostPolicy;
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
  responseCache: CacheStore;
  inFlightRequests: Map<string, InFlightRequest>;
}
