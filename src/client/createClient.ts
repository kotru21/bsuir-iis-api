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

function createInternalConfig<TRawDefault extends boolean>(
  options: BsuirClientOptions & { defaultRaw: TRawDefault }
): InternalClientConfig<TRawDefault> {
  const timeoutMs = assertIntegerOption(options.timeoutMs, "timeoutMs", 1) ?? 10_000;
  const retries = assertIntegerOption(options.retries, "retries", 0) ?? 1;
  const retryDelayMs = assertIntegerOption(options.retryDelayMs, "retryDelayMs", 0) ?? 300;
  const retryMaxDelayMs =
    assertIntegerOption(options.retryMaxDelayMs, "retryMaxDelayMs", 0) ?? 3_000;
  const cacheTtlMs = assertIntegerOption(options.cache?.ttlMs, "cache.ttlMs", 1);
  const cacheMaxEntries = assertIntegerOption(options.cache?.maxEntries, "cache.maxEntries", 1) ?? 200;

  if (retryDelayMs > retryMaxDelayMs) {
    throw new BsuirConfigurationError("'retryDelayMs' must be less than or equal to 'retryMaxDelayMs'");
  }

  return {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    fetchImpl: resolveFetch(options.fetch),
    signal: options.signal,
    timeoutMs,
    retries,
    retryDelayMs,
    retryMaxDelayMs,
    retryJitter: options.retryJitter ?? true,
    userAgent: options.userAgent,
    cacheTtlMs,
    cacheMaxEntries,
    dedupeInFlight: options.dedupeInFlight ?? true,
    validateResponses: options.validateResponses ?? false,
    hooks: options.hooks ?? {},
    responseCache: new Map(),
    inFlightRequests: new Map(),
    defaultRaw: options.defaultRaw
  };
}

function buildClient<TRawDefault extends boolean>(config: InternalClientConfig<TRawDefault>) {
  const schedule = createScheduleModule(config);

  return {
    schedule,
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
 * Creates a configured BSUIR IIS API client.
 * Pass `{ defaultRaw: true }` to switch default schedule return shape from normalized to raw.
 */
export function createBsuirClient(
  options: BsuirClientOptions & { defaultRaw: true }
): ReturnType<typeof buildClient<true>>;
export function createBsuirClient(
  options?: BsuirClientOptions & { defaultRaw?: false | undefined }
): ReturnType<typeof buildClient<false>>;
export function createBsuirClient(
  options: BsuirClientOptions = {}
): ReturnType<typeof buildClient<boolean>> {
  const defaultRaw = options.defaultRaw ?? false;
  const config = createInternalConfig({ ...options, defaultRaw });
  return buildClient(config);
}

/**
 * Public client contract returned by `createBsuirClient`.
 */
export type BsuirClient = ReturnType<typeof createBsuirClient>;
