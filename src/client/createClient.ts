import { BsuirConfigurationError } from "./errors";
import type { BsuirClientOptions, InternalClientConfig } from "./types";
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
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minInclusive) {
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
    throw new BsuirConfigurationError(
      `'${optionName}' must not contain CR, LF or NUL characters`
    );
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

  if (parsed.port.length > 0) {
    throw new BsuirConfigurationError("'baseUrl' must not include an explicit port");
  }

  const normalizedAllowedHosts = new Set(
    allowedHosts.map((host) => normalizeHostname(host)).filter((host) => host.length > 0)
  );
  if (normalizedAllowedHosts.size === 0) {
    throw new BsuirConfigurationError("'allowedBaseUrlHosts' must contain at least one hostname");
  }

  // When allowInsecureHttp is enabled, only loopback hosts are permitted in the allowlist —
  // a non-loopback host in the list would create a confusing configuration where the user
  // appears to have opted in to plaintext HTTP for a public host. Plaintext HTTP must stay
  // strictly local/test only.
  if (allowInsecureHttp) {
    const nonLoopback = [...normalizedAllowedHosts].filter((host) => !isLoopbackHost(host));
    if (nonLoopback.length > 0) {
      throw new BsuirConfigurationError(
        `'allowInsecureHttp: true' requires every host in 'allowedBaseUrlHosts' to be loopback (localhost/127.x/[::1]); got non-loopback: ${nonLoopback.join(", ")}`
      );
    }
  }

  const host = normalizeHostname(parsed.hostname);
  if (host.length === 0) {
    throw new BsuirConfigurationError("'baseUrl' must include a valid hostname");
  }
  if (parsed.protocol === "http:" && allowInsecureHttp && !isLoopbackHost(host)) {
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

function createInternalConfig<TRawDefault extends boolean>(
  options: BsuirClientOptions & { defaultRaw: TRawDefault }
): InternalClientConfig<TRawDefault> {
  const timeoutMs = assertIntegerOption(options.timeoutMs, "timeoutMs", 1) ?? 10_000;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new BsuirConfigurationError(
      `'timeoutMs' must not exceed ${String(MAX_TIMEOUT_MS)}ms (5 minutes)`
    );
  }

  const retries = assertIntegerOption(options.retries, "retries", 0) ?? 1;
  const retryDelayMs = assertIntegerOption(options.retryDelayMs, "retryDelayMs", 0) ?? 300;
  const retryMaxDelayMs =
    assertIntegerOption(options.retryMaxDelayMs, "retryMaxDelayMs", 0) ?? 3000;
  const cacheTtlMs = assertIntegerOption(options.cache?.ttlMs, "cache.ttlMs", 1);
  const cacheMaxEntries =
    assertIntegerOption(options.cache?.maxEntries, "cache.maxEntries", 1) ?? 200;
  const maxResponseBytes =
    assertIntegerOption(options.maxResponseBytes, "maxResponseBytes", 1) ??
    DEFAULT_MAX_RESPONSE_BYTES;
  const allowInsecureHttp = options.allowInsecureHttp ?? false;
  const allowedBaseUrlHosts = options.allowedBaseUrlHosts ?? DEFAULT_ALLOWED_BASE_URL_HOSTS;

  if (retryDelayMs > retryMaxDelayMs) {
    throw new BsuirConfigurationError(
      "'retryDelayMs' must be less than or equal to 'retryMaxDelayMs'"
    );
  }

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
    responseCache: new Map(),
    inFlightRequests: new Map(),
    defaultRaw: options.defaultRaw
  };
}

/**
 * Fully-typed public shape of the BSUIR API client.
 * All module types are inlined so API Extractor never needs to reach into private helpers.
 *
 * `TRawDefault` controls the default return type of
 * `schedule.getGroup` / `schedule.getEmployee` when the per-call `raw` option is omitted:
 * - `false` (default) → returns `NormalizedScheduleResponse`
 * - `true`            → returns `ScheduleResponse` (raw API payload)
 *
 * Per-call `raw` always takes precedence over this default.
 *
 * @example
 * ```ts
 * // Default (normalized):
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
export interface BsuirClientShape<TRawDefault extends boolean> {
  schedule: ReturnType<typeof createScheduleModule<TRawDefault>>;
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
 * The `defaultRaw` option controls the default return shape of
 * `schedule.getGroup` and `schedule.getEmployee`:
 * - omitted or `false` → `NormalizedScheduleResponse` (flattened lessons + helpers)
 * - `true` → raw `ScheduleResponse` exactly as received from the BSUIR IIS API
 *
 * Per-call `raw` option always takes precedence over `defaultRaw`.
 *
 * The three overloads exist so TypeScript can narrow the returned client's
 * default schedule shape:
 *
 * 1. `defaultRaw: true` literal → `BsuirClientShape<true>` (raw default)
 * 2. `defaultRaw: false`/omitted → `BsuirClientShape<false>` (normalized default)
 * 3. `defaultRaw: boolean` (variable of unknown polarity) → `BsuirClient` union
 *
 * @example
 * ```ts
 * // Normalized (default):
 * const client = createBsuirClient();
 * //    ^? BsuirClientShape<false>
 *
 * // Raw by default:
 * const rawClient = createBsuirClient({ defaultRaw: true });
 * //    ^? BsuirClientShape<true>
 *
 * // Custom fetch + timeout, normalized default:
 * const c = createBsuirClient({ fetch: myFetch, timeoutMs: 5_000 });
 * ```
 *
 * If you need to accept either kind of client (e.g. a helper that doesn't care
 * about the default), use the public {@link BsuirClient} alias.
 */
export function createBsuirClient(
  options: BsuirClientOptions & { defaultRaw: true }
): BsuirClientShape<true>;
export function createBsuirClient(
  options?: BsuirClientOptions & { defaultRaw?: false | undefined }
): BsuirClientShape<false>;
export function createBsuirClient(
  options: BsuirClientOptions & { defaultRaw: boolean }
): BsuirClientShape<true> | BsuirClientShape<false>;
export function createBsuirClient(options: BsuirClientOptions = {}): BsuirClientShape<boolean> {
  const defaultRaw = options.defaultRaw ?? false;
  const config = createInternalConfig({ ...options, defaultRaw });
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
 * Public client contract returned by `createBsuirClient`.
 *
 * This is the union `BsuirClientShape<true> | BsuirClientShape<false>` — useful for
 * helpers that accept a client without caring whether it was constructed with
 * `defaultRaw: true` or not. When the polarity is known at the call site,
 * prefer the more specific `BsuirClientShape<true>` / `BsuirClientShape<false>`.
 */
export type BsuirClient = BsuirClientShape<true> | BsuirClientShape<false>;
