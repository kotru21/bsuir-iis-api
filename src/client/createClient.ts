import { BsuirConfigurationError } from "./errors";
import type { BsuirClientOptions, CacheStore, InternalClientConfig } from "./types";
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

const DEFAULT_BASE_URL = "https://iis.bsuir.by/api/v1";
const DEFAULT_ALLOWED_BASE_URL_HOSTS = ["iis.bsuir.by"];
const DEFAULT_MAX_RESPONSE_BYTES = 5_000_000;
const INVALID_HEADER_LINE_BREAK = /[\r\n]/;

// Prevents setTimeout() integer overflow (max safe value ~24.8 days).
// 5 minutes is a generous upper bound for any HTTP request in this context.
const MAX_TIMEOUT_MS = 300_000;

function resolveFetch(customFetch?: typeof globalThis.fetch): typeof globalThis.fetch {
  if (customFetch) {
    return customFetch;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new BsuirConfigurationError(
      "Global fetch is unavailable. Provide 'fetch' in createBsuirClient options."
    );
  }

  return globalThis.fetch;
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

function normalizeHostname(rawHostname: string): string {
  const trimmed = rawHostname.trim().toLowerCase().replace(/\.+$/, "");
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}

// Per-request `options.headers` go through the platform `Headers` constructor in
// requestJson, which rejects CR/LF/NUL with a runtime error. We only pre-validate
// configuration-level header values (e.g. `userAgent`) here so misconfiguration is
// surfaced as a structured `BsuirConfigurationError` at client construction time
// rather than at first request.
function assertSafeHeaderValue(value: string | undefined, optionName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (INVALID_HEADER_LINE_BREAK.test(value) || value.includes("\0")) {
    throw new BsuirConfigurationError(`'${optionName}' must not contain CR, LF or NUL characters`);
  }
  return value;
}

function normalizeBaseUrl(
  rawBaseUrl: string,
  allowInsecureHttp: boolean,
  allowedHosts: readonly string[]
): string {
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

  if (parsed.protocol !== "https:" && !(allowInsecureHttp && parsed.protocol === "http:")) {
    throw new BsuirConfigurationError(
      "'baseUrl' must use HTTPS. Set 'allowInsecureHttp: true' only for trusted local/test endpoints."
    );
  }

  const host = normalizeHostname(parsed.hostname);

  // Explicit ports are rejected for public hosts (they usually indicate a
  // copy-paste mistake), but allowed on loopback so local dev/mock servers —
  // which practically always run on a non-standard port — stay usable.
  if (parsed.port.length > 0 && !isLoopbackHost(host)) {
    throw new BsuirConfigurationError(
      "'baseUrl' must not include an explicit port (allowed only for loopback hosts)"
    );
  }

  const normalizedAllowedHosts = new Set(
    allowedHosts
      .map((allowedHost) => normalizeHostname(allowedHost))
      .filter((allowedHost) => allowedHost.length > 0)
  );
  if (normalizedAllowedHosts.size === 0) {
    throw new BsuirConfigurationError("'allowedBaseUrlHosts' must contain at least one hostname");
  }

  // When allowInsecureHttp is enabled, only loopback hosts are permitted in the allowlist —
  // a non-loopback host in the list would create a confusing configuration where the user
  // appears to have opted in to plaintext HTTP for a public host. Plaintext HTTP must stay
  // strictly local/test only.
  if (allowInsecureHttp) {
    const nonLoopback = [...normalizedAllowedHosts].filter(
      (allowedHost) => !isLoopbackHost(allowedHost)
    );
    if (nonLoopback.length > 0) {
      throw new BsuirConfigurationError(
        `'allowInsecureHttp: true' requires every host in 'allowedBaseUrlHosts' to be loopback (localhost/127.x/[::1]); got non-loopback: ${nonLoopback.join(", ")}`
      );
    }
  }

  if (host.length === 0) {
    throw new BsuirConfigurationError("'baseUrl' must include a valid hostname");
  }
  if (allowInsecureHttp && parsed.protocol === "http:" && !isLoopbackHost(host)) {
    throw new BsuirConfigurationError(
      "'allowInsecureHttp: true' is restricted to localhost/loopback HTTP endpoints only"
    );
  }
  if (!normalizedAllowedHosts.has(host)) {
    throw new BsuirConfigurationError(
      `'baseUrl' host '${host}' is not allowed. Allowed hosts: ${[...normalizedAllowedHosts].join(", ")}`
    );
  }

  parsed.hostname = host;
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${normalizedPath}`;
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
  const allowInsecureHttp = options.allowInsecureHttp ?? false;
  const allowedBaseUrlHosts = options.allowedBaseUrlHosts ?? DEFAULT_ALLOWED_BASE_URL_HOSTS;

  return {
    baseUrl: normalizeBaseUrl(
      options.baseUrl ?? DEFAULT_BASE_URL,
      allowInsecureHttp,
      allowedBaseUrlHosts
    ),
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
 * All module types are inlined so API Extractor never needs to reach into private helpers.
 *
 * Use explicit raw/envelope helpers on the `schedule` module to obtain the
 * API's raw `ScheduleResponse` when required (e.g. `getGroupRaw`,
 * `getEmployeeRaw`, `getGroupBySubgroupEnvelope`). The default
 * `getGroup`/`getEmployee` return a normalized payload.
 */
export interface BsuirClientShape {
  schedule: ReturnType<typeof createScheduleModule>;
  groups: ReturnType<typeof createGroupsModule>;
  employees: ReturnType<typeof createEmployeesModule>;
  faculties: ReturnType<typeof createFacultiesModule>;
  departments: ReturnType<typeof createDepartmentsModule>;
  specialities: ReturnType<typeof createSpecialitiesModule>;
  announcements: ReturnType<typeof createAnnouncementsModule>;
  auditories: ReturnType<typeof createAuditoriesModule>;
}

/**
 * Creates a configured BSUIR IIS API client.
 *
 * The `schedule` module exposes both normalized and explicit raw/envelope
 * helpers. Use `getGroup` / `getEmployee` for normalized payloads and
 * `getGroupRaw` / `getEmployeeRaw` when you need the original API envelope.
 * Subgroup shapes use `get*BySubgroup`, `get*BySubgroupRaw`, and
 * `get*BySubgroupEnvelope`.
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
