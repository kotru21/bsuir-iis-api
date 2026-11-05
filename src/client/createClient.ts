import { BsuirConfigurationError } from "./errors";
import {
  describeHostViolation,
  normalizeHostname,
  PUBLIC_IIS_HOST,
  type HostPolicy
} from "./hosts";
import type { BsuirClientOptions, CacheStore, InternalClientConfig } from "./types";
import type { AnnouncementsModule } from "../modules/announcements";
import type { ListModule } from "../modules/createListModule";
import type { ScheduleModule } from "../modules/scheduleApi";
import {
  createAnnouncementsModule,
  createAuditoriesModule,
  createDepartmentsModule,
  createEmployeesModule,
  createFacultiesModule,
  createGroupsModule,
  createScheduleModule,
  createSpecialitiesModule
} from "../modules";
import type {
  Auditory,
  Department,
  Faculty,
  Speciality,
  StudentGroupCatalogItem
} from "../types/catalog";
import type { EmployeeCatalogItem } from "../types/employee";

const DEFAULT_BASE_URL = "https://iis.bsuir.by/api/v1";
const DEFAULT_ALLOWED_BASE_URL_HOSTS = [PUBLIC_IIS_HOST];
const DEFAULT_MAX_RESPONSE_BYTES = 5_000_000;
const INVALID_HEADER_LINE_BREAK = /[\r\n]/;

// Prevents setTimeout() integer overflow (max safe value ~24.8 days).
// 5 minutes is a generous upper bound for any HTTP request in this context.
const MAX_TIMEOUT_MS = 300_000;

/**
 * Resolves the `fetch` implementation and detaches it from any receiver.
 *
 * The pipeline stores it on the config object, so calling it directly would pass
 * that object as `this`. Native `fetch` in browsers and Cloudflare Workers rejects
 * any receiver other than the global object ("Illegal invocation"), which used to
 * turn every browser request into a `BsuirNetworkError`. The wrapper always calls
 * it without a receiver, which works for the global `fetch`, `window.fetch` passed
 * by the user, and plain custom functions alike.
 */
function resolveFetch(customFetch?: typeof globalThis.fetch): typeof globalThis.fetch {
  const fetchFn = customFetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new BsuirConfigurationError(
      customFetch === undefined
        ? "Global fetch is unavailable. Provide 'fetch' in createBsuirClient options."
        : "'fetch' must be a function"
    );
  }

  return (input, init) => fetchFn(input, init);
}

function assertIntegerOption(
  value: number | undefined,
  name: string,
  minInclusive: number
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < minInclusive) {
    throw new BsuirConfigurationError(
      `'${name}' must be an integer greater than or equal to ${String(minInclusive)}`
    );
  }
  return value;
}

// The platform `Headers` constructor rejects CR/LF/NUL with a runtime error at the
// first request. Pre-validating configuration-level header values (`userAgent`) here
// surfaces misconfiguration as a structured `BsuirConfigurationError` at client
// construction time instead.
function assertSafeHeaderValue(value: string | undefined, optionName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (INVALID_HEADER_LINE_BREAK.test(value) || value.includes("\0")) {
    throw new BsuirConfigurationError(`'${optionName}' must not contain CR, LF or NUL characters`);
  }
  return value;
}

/**
 * Validates `baseUrl` against the host policy and returns it without a trailing slash.
 *
 * - Any explicit port is fine (proxies on :8443, local mock servers on :3000…).
 * - `http:` needs `allowInsecureHttp: true` and an explicitly allowlisted host; the
 *   public IIS host always requires HTTPS.
 */
function normalizeBaseUrl(rawBaseUrl: string, policy: HostPolicy): string {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new BsuirConfigurationError("'baseUrl' must be a valid absolute URL");
  }

  if (parsed.username || parsed.password) {
    throw new BsuirConfigurationError("'baseUrl' must not include credentials");
  }

  if (parsed.search || parsed.hash) {
    throw new BsuirConfigurationError("'baseUrl' must not include query string or hash");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new BsuirConfigurationError("'baseUrl' must use HTTPS");
  }

  const host = normalizeHostname(parsed.hostname);
  if (host.length === 0) {
    throw new BsuirConfigurationError("'baseUrl' must include a valid hostname");
  }

  const violation = describeHostViolation(parsed, policy);
  if (violation !== null) {
    throw new BsuirConfigurationError(`'baseUrl' is not allowed: ${violation}`);
  }

  parsed.hostname = host;
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${normalizedPath}`;
}

function createHostPolicy(allowedHosts: readonly string[], allowInsecureHttp: boolean): HostPolicy {
  const normalized = new Set(
    allowedHosts.map((host) => normalizeHostname(host)).filter((host) => host.length > 0)
  );
  if (normalized.size === 0) {
    throw new BsuirConfigurationError("'allowedBaseUrlHosts' must contain at least one hostname");
  }
  return { allowedHosts: normalized, allowInsecureHttp };
}

function assertCacheStore(store: unknown): asserts store is CacheStore {
  if (typeof store !== "object" || store === null) {
    throw new BsuirConfigurationError(
      "'cache.store' must be a synchronous Map-compatible store (get/set/delete/keys/entries/size)"
    );
  }
  const candidate = store as Partial<
    Record<"get" | "set" | "delete" | "keys" | "entries" | "size", unknown>
  >;
  if (
    typeof candidate.get !== "function" ||
    typeof candidate.set !== "function" ||
    typeof candidate.delete !== "function" ||
    typeof candidate.keys !== "function" ||
    typeof candidate.entries !== "function" ||
    typeof candidate.size !== "number"
  ) {
    throw new BsuirConfigurationError(
      "'cache.store' must be a synchronous Map-compatible store (get/set/delete/keys/entries/size)"
    );
  }
}

function createInternalConfig(options: BsuirClientOptions): InternalClientConfig {
  const timeoutMs = assertIntegerOption(options.timeoutMs, "timeoutMs", 1) ?? 10_000;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new BsuirConfigurationError(
      `'timeoutMs' must not exceed ${String(MAX_TIMEOUT_MS)}ms (5 minutes)`
    );
  }

  const retryDelayMs = assertIntegerOption(options.retryDelayMs, "retryDelayMs", 0) ?? 300;
  const retryMaxDelayMs =
    assertIntegerOption(options.retryMaxDelayMs, "retryMaxDelayMs", 0) ?? 3000;

  if (retryDelayMs > retryMaxDelayMs) {
    throw new BsuirConfigurationError(
      "'retryDelayMs' must be less than or equal to 'retryMaxDelayMs'"
    );
  }

  const retries = assertIntegerOption(options.retries, "retries", 0) ?? 1;
  const cacheTtlMs = assertIntegerOption(options.cache?.ttlMs, "cache.ttlMs", 1);
  const cacheMaxEntries =
    assertIntegerOption(options.cache?.maxEntries, "cache.maxEntries", 1) ?? 200;
  const cacheStore = options.cache?.store;
  if (cacheStore !== undefined) {
    assertCacheStore(cacheStore);
  }
  const maxResponseBytes =
    assertIntegerOption(options.maxResponseBytes, "maxResponseBytes", 1) ??
    DEFAULT_MAX_RESPONSE_BYTES;
  const hostPolicy = createHostPolicy(
    options.allowedBaseUrlHosts ?? DEFAULT_ALLOWED_BASE_URL_HOSTS,
    options.allowInsecureHttp ?? false
  );

  return {
    baseUrl: normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL, hostPolicy),
    hostPolicy,
    fetchImpl: resolveFetch(options.fetch),
    signal: options.signal,
    timeoutMs,
    retries,
    retryDelayMs,
    retryMaxDelayMs,
    retryJitter: options.retryJitter ?? true,
    userAgent: assertSafeHeaderValue(options.userAgent, "userAgent"),
    cacheTtlMs,
    cacheMaxEntries,
    dedupeInFlight: options.dedupeInFlight ?? false,
    maxResponseBytes,
    validateResponses: options.validateResponses ?? false,
    hooks: options.hooks ?? {},
    responseCache: cacheStore ?? new Map(),
    inFlightRequests: new Map()
  };
}

/**
 * Fully-typed public shape of the BSUIR API client.
 *
 * `schedule.get(target, options)` returns a normalized schedule (optionally narrowed
 * by `filter`); `schedule.getRaw(target)` returns the IIS envelope as-is.
 */
export interface BsuirClientShape {
  schedule: ScheduleModule;
  groups: ListModule<StudentGroupCatalogItem>;
  employees: ListModule<EmployeeCatalogItem>;
  faculties: ListModule<Faculty>;
  departments: ListModule<Department>;
  specialities: ListModule<Speciality>;
  announcements: AnnouncementsModule;
  auditories: ListModule<Auditory>;
}

/**
 * Creates a configured BSUIR IIS API client.
 *
 * Schedules: `client.schedule.get({ group: "053503" })` or
 * `client.schedule.get({ employee: "s-nesterenkov" }, { filter: { subgroup: 2 } })`
 * for a normalized payload, `client.schedule.getRaw(target)` for the IIS envelope.
 *
 * Prefer {@link createBsuirClient.strict} in development/tests when you want
 * `validateResponses: true` without repeating the option.
 */
export function createBsuirClient(options: BsuirClientOptions = {}): BsuirClientShape {
  const config = createInternalConfig(options);
  return {
    schedule: createScheduleModule(config),
    groups: createGroupsModule(config),
    employees: createEmployeesModule(config),
    faculties: createFacultiesModule(config),
    departments: createDepartmentsModule(config),
    specialities: createSpecialitiesModule(config),
    announcements: createAnnouncementsModule(config),
    auditories: createAuditoriesModule(config)
  };
}

/**
 * Same as {@link createBsuirClient} with `validateResponses` forced to `true`.
 * Other options are unchanged. The default `createBsuirClient()` still leaves
 * validation off.
 *
 * Attached as `createBsuirClient.strict` for discoverability in IDEs.
 */
createBsuirClient.strict = function createBsuirClientStrict(
  options: BsuirClientOptions = {}
): BsuirClientShape {
  return createBsuirClient({ ...options, validateResponses: true });
};

/**
 * Public client contract returned by `createBsuirClient`.
 */
export type BsuirClient = BsuirClientShape;
