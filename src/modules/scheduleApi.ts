import { requestJson } from "../client/http";
import { assertScheduleResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import { assertEmployeeUrlId, assertGroupNumber } from "../utils/guards";
import { parseCurrentWeek } from "../utils/week";
import { normalizeSchedule } from "./scheduleNormalize";
import { createScheduleSubjectMethods } from "./scheduleApiSubject";
import type { ReadOptions } from "./types";

/**
 * Read options for schedule methods that return a normalized payload.
 */
export interface ScheduleReadOptions extends ReadOptions {
  /**
   * When `true`, flatten IIS `nextSchedules` into `lessons` with
   * `source: "nextSchedules"`. Default `false` = current term only.
   */
  includeNextSchedules?: boolean;
}

/**
 * Schedule module: raw/normalized fetches, filters, subgroup helpers, current week.
 */
export interface ScheduleModule {
  getGroup(groupNumber: string, options?: ScheduleReadOptions): Promise<NormalizedScheduleResponse>;
  getEmployee(urlId: string, options?: ScheduleReadOptions): Promise<NormalizedScheduleResponse>;

  getGroupFiltered(
    groupNumber: string,
    filter: ScheduleFilterOptions,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;

  getEmployeeFiltered(
    urlId: string,
    filter: ScheduleFilterOptions,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;

  getGroupExams(
    groupNumber: string,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getEmployeeExams(urlId: string, options?: ScheduleReadOptions): Promise<FlattenedScheduleItem[]>;

  getGroupRaw(groupNumber: string, options?: ReadOptions): Promise<ScheduleResponse>;
  getEmployeeRaw(urlId: string, options?: ReadOptions): Promise<ScheduleResponse>;

  getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getGroupBySubgroupRaw(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<ScheduleItem[]>;
  getGroupBySubgroupEnvelope(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<ScheduleResponse>;

  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getEmployeeBySubgroupRaw(
    urlId: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<ScheduleItem[]>;
  getEmployeeBySubgroupEnvelope(
    urlId: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<ScheduleResponse>;

  getCurrentWeek(options?: ReadOptions): Promise<number>;
}

/**
 * Creates schedule API module with raw/normalized response support.
 */
export function createScheduleModule(config: Readonly<InternalClientConfig>): ScheduleModule {
  /**
   * Returns schedule for a student group.
   * Returns a normalized payload. Use `getGroupRaw` for the raw API envelope.
   */
  async function getGroup(
    groupNumber: string,
    options: ScheduleReadOptions = {}
  ): Promise<NormalizedScheduleResponse> {
    const resolvedOptions = options;
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: resolvedOptions.signal,
      cache: resolvedOptions.cache,
      responseValidator: config.validateResponses
        ? (value) => {
            assertScheduleResponse(value, "/schedule");
          }
        : undefined
    });
    const response = payload as ScheduleResponse;
    return normalizeSchedule(response, {
      validate: false,
      endpoint: "/schedule",
      ...(resolvedOptions.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: resolvedOptions.includeNextSchedules })
    });
  }

  /**
   * Returns schedule for an employee.
   * Returns a normalized payload. Use `getEmployeeRaw` for the raw API envelope.
   */
  async function getEmployee(
    urlId: string,
    options: ScheduleReadOptions = {}
  ): Promise<NormalizedScheduleResponse> {
    const resolvedOptions = options;
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(config, endpoint, {
      signal: resolvedOptions.signal,
      cache: resolvedOptions.cache,
      responseValidator: config.validateResponses
        ? (value) => {
            assertScheduleResponse(value, endpoint);
          }
        : undefined
    });
    const response = payload as ScheduleResponse;
    return normalizeSchedule(response, {
      validate: false,
      endpoint,
      ...(resolvedOptions.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: resolvedOptions.includeNextSchedules })
    });
  }

  /**
   * Returns current academic week number.
   */
  async function getCurrentWeek(options: ReadOptions = {}): Promise<number> {
    const payload = await requestJson<unknown>(config, "/schedule/current-week", {
      signal: options.signal,
      cache: options.cache
    });
    return parseCurrentWeek(payload);
  }

  async function getGroupRaw(
    groupNumber: string,
    options: ReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: options.signal,
      cache: options.cache,
      responseValidator: config.validateResponses
        ? (value) => {
            assertScheduleResponse(value, "/schedule");
          }
        : undefined
    });
    return payload as ScheduleResponse;
  }

  async function getEmployeeRaw(
    urlId: string,
    options: ReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(config, endpoint, {
      signal: options.signal,
      cache: options.cache,
      responseValidator: config.validateResponses
        ? (value) => {
            assertScheduleResponse(value, endpoint);
          }
        : undefined
    });
    return payload as ScheduleResponse;
  }

  const groupMethods = createScheduleSubjectMethods({
    getNormalized: getGroup,
    getRaw: getGroupRaw
  });
  const employeeMethods = createScheduleSubjectMethods({
    getNormalized: getEmployee,
    getRaw: getEmployeeRaw
  });

  return {
    getGroup,
    getEmployee,
    getGroupRaw,
    getEmployeeRaw,
    getGroupFiltered: (id, filter, options) => groupMethods.getFiltered(id, filter, options),
    getEmployeeFiltered: (id, filter, options) => employeeMethods.getFiltered(id, filter, options),
    /**
     * Returns flattened regular schedule lessons for a subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Use raw/envelope helpers for other shapes.
     */
    getGroupBySubgroup: (id, subgroup, options) =>
      groupMethods.getBySubgroup(id, subgroup, options),
    /**
     * Returns raw `ScheduleItem[]` for a group subgroup (no day/source metadata).
     * Shared lessons (`numSubgroup === 0`) are included.
     */
    getGroupBySubgroupRaw: (id, subgroup, options) =>
      groupMethods.getBySubgroupRaw(id, subgroup, options),
    /**
     * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Preserves envelope fields.
     */
    getGroupBySubgroupEnvelope: (id, subgroup, options) =>
      groupMethods.getBySubgroupEnvelope(id, subgroup, options),
    /**
     * Returns flattened regular schedule lessons for an employee filtered by subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Use raw/envelope helpers for other shapes.
     */
    getEmployeeBySubgroup: (id, subgroup, options) =>
      employeeMethods.getBySubgroup(id, subgroup, options),
    /**
     * Returns raw `ScheduleItem[]` for an employee subgroup filter.
     * Shared lessons (`numSubgroup === 0`) are included.
     */
    getEmployeeBySubgroupRaw: (id, subgroup, options) =>
      employeeMethods.getBySubgroupRaw(id, subgroup, options),
    /**
     * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Preserves envelope fields.
     */
    getEmployeeBySubgroupEnvelope: (id, subgroup, options) =>
      employeeMethods.getBySubgroupEnvelope(id, subgroup, options),
    getCurrentWeek,

    /**
     * Returns exams for a group.
     */
    getGroupExams: (id, options) => groupMethods.getExams(id, options),

    /**
     * Returns exams for an employee.
     */
    getEmployeeExams: (id, options) => employeeMethods.getExams(id, options)
  };
}
