import { requestJson } from "../client/http";
import {
  assertScheduleResponse,
  assertScheduleStructuralEnvelope
} from "../client/responseValidators";
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
   * `source: "nextSchedules"`. Default (`undefined`) is current-term only
   * unless `schedules` is empty, in which case `nextSchedules` is used.
   * Pass `false` to never include next-term rows.
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
    options?: ScheduleReadOptions
  ): Promise<ScheduleItem[]>;
  getGroupBySubgroupEnvelope(
    groupNumber: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<ScheduleResponse>;

  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getEmployeeBySubgroupRaw(
    urlId: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<ScheduleItem[]>;
  getEmployeeBySubgroupEnvelope(
    urlId: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<ScheduleResponse>;

  getCurrentWeek(options?: ReadOptions): Promise<number>;
}

/**
 * Creates schedule API module with raw/normalized response support.
 */
export function createScheduleModule(config: Readonly<InternalClientConfig>): ScheduleModule {
  function scheduleResponseValidator(endpoint: string): (value: unknown) => void {
    return (value: unknown): void => {
      if (config.validateResponses) {
        assertScheduleResponse(value, endpoint);
      } else {
        // Always-on map/array/day-bucket shape — same structural rules as
        // normalizeSchedule, without deep lesson-item checks.
        assertScheduleStructuralEnvelope(value, endpoint);
      }
    };
  }

  /**
   * Returns schedule for a student group.
   * Returns a normalized payload. Use `getGroupRaw` for the raw API envelope.
   */
  async function getGroup(
    groupNumber: string,
    options: ScheduleReadOptions = {}
  ): Promise<NormalizedScheduleResponse> {
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: options.signal,
      cache: options.cache,
      // Validate before cache write/hit so poisoned store entries cannot stick.
      responseValidator: scheduleResponseValidator("/schedule")
    });
    const response = payload as ScheduleResponse;
    return normalizeSchedule(response, {
      validate: false,
      endpoint: "/schedule",
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
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
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(config, endpoint, {
      signal: options.signal,
      cache: options.cache,
      responseValidator: scheduleResponseValidator(endpoint)
    });
    const response = payload as ScheduleResponse;
    return normalizeSchedule(response, {
      validate: false,
      endpoint,
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
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
      responseValidator: scheduleResponseValidator("/schedule")
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
      responseValidator: scheduleResponseValidator(endpoint)
    });
    return payload as ScheduleResponse;
  }

  const groupMethods = createScheduleSubjectMethods({
    getNormalized: getGroup,
    getRaw: getGroupRaw,
    endpoint: () => "/schedule"
  });
  const employeeMethods = createScheduleSubjectMethods({
    getNormalized: getEmployee,
    getRaw: getEmployeeRaw,
    endpoint: (urlId) => `/employees/schedule/${encodeURIComponent(urlId)}`
  });

  return {
    getGroup,
    getEmployee,
    getGroupRaw,
    getEmployeeRaw,
    getGroupFiltered: (id, filter, options) => groupMethods.getFiltered(id, filter, options),
    getEmployeeFiltered: (id, filter, options) => employeeMethods.getFiltered(id, filter, options),
    /**
     * Returns flattened weekly lessons (no exams) for a subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Next-term lessons follow the
     * `includeNextSchedules` rule of `getGroup` (included when requested, or when the
     * current term is empty). Use raw/envelope helpers for other shapes.
     */
    getGroupBySubgroup: (id, subgroup, options) =>
      groupMethods.getBySubgroup(id, subgroup, options),
    /**
     * Returns raw `ScheduleItem[]` for a group subgroup (no day/source metadata).
     * Shared lessons (`numSubgroup === 0`) are included; next-term lessons follow the
     * same `includeNextSchedules` rule as `getGroup`.
     */
    getGroupBySubgroupRaw: (id, subgroup, options) =>
      groupMethods.getBySubgroupRaw(id, subgroup, options),
    /**
     * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Preserves envelope fields.
     * `nextSchedules` is filtered the same way when `includeNextSchedules` is true, or
     * unset while current-term `schedules` is empty; otherwise it is omitted.
     */
    getGroupBySubgroupEnvelope: (id, subgroup, options) =>
      groupMethods.getBySubgroupEnvelope(id, subgroup, options),
    /**
     * Returns flattened weekly lessons (no exams) for an employee filtered by subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Next-term lessons follow the
     * `includeNextSchedules` rule of `getEmployee` (included when requested, or when the
     * current term is empty). Use raw/envelope helpers for other shapes.
     */
    getEmployeeBySubgroup: (id, subgroup, options) =>
      employeeMethods.getBySubgroup(id, subgroup, options),
    /**
     * Returns raw `ScheduleItem[]` for an employee subgroup filter.
     * Shared lessons (`numSubgroup === 0`) are included; next-term lessons follow the
     * same `includeNextSchedules` rule as `getEmployee`.
     */
    getEmployeeBySubgroupRaw: (id, subgroup, options) =>
      employeeMethods.getBySubgroupRaw(id, subgroup, options),
    /**
     * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
     * Shared lessons (`numSubgroup === 0`) are included. Preserves envelope fields.
     * `nextSchedules` is filtered the same way when `includeNextSchedules` is true, or
     * unset while current-term `schedules` is empty; otherwise it is omitted.
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
