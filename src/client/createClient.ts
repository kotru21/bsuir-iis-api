import type { BsuirClientOptions, InternalClientConfig } from "./types";
import { createAnnouncementsModule } from "../modules/announcements";
import { createAuditoriesModule } from "../modules/auditories";
import { createDepartmentsModule } from "../modules/departments";
import { createEmployeesModule } from "../modules/employees";
import { createFacultiesModule } from "../modules/faculties";
import { createGroupsModule } from "../modules/groups";
import { createScheduleModule } from "../modules/schedule";
import { createSpecialitiesModule } from "../modules/specialities";

const DEFAULT_BASE_URL = "https://iis.bsuir.by/api/v1";

function resolveFetch(customFetch?: typeof globalThis.fetch): typeof globalThis.fetch {
  if (customFetch) {
    return customFetch;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("Global fetch is unavailable. Provide 'fetch' in createBsuirClient options.");
  }

  return globalThis.fetch;
}

function createInternalConfig(options: BsuirClientOptions = {}): InternalClientConfig {
  return {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    fetchImpl: resolveFetch(options.fetch),
    timeoutMs: options.timeoutMs ?? 10_000,
    retries: options.retries ?? 1,
    retryDelayMs: options.retryDelayMs ?? 300,
    retryMaxDelayMs: options.retryMaxDelayMs ?? 3_000,
    retryJitter: options.retryJitter ?? true,
    userAgent: options.userAgent,
    defaultRaw: options.defaultRaw ?? false
  };
}

/**
 * Creates a configured BSUIR IIS API client.
 */
export function createBsuirClient(options: BsuirClientOptions = {}) {
  const config = createInternalConfig(options);
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
 * Public client contract returned by {@link createBsuirClient}.
 */
export type BsuirClient = ReturnType<typeof createBsuirClient>;
