import { requestJson } from "../client/http";
import { assertApiDateResponse, assertScheduleResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { ApiDateResponse } from "../types/common";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import { assertEmployeeUrlId, assertGroupNumber, assertPositiveInt } from "../utils/guards";
import { parseCurrentWeek } from "../utils/week";
import { normalizeSchedule } from "./scheduleNormalize";
import { createScheduleSubjectMethods } from "./scheduleApiSubject";
import type { ReadOptions } from "./types";

export interface ScheduleModule {
  getGroup(groupNumber: string, options?: ReadOptions): Promise<NormalizedScheduleResponse>;
  getEmployee(urlId: string, options?: ReadOptions): Promise<NormalizedScheduleResponse>;

  getGroupFiltered(
    groupNumber: string,
    filter: ScheduleFilterOptions,
    options?: ReadOptions
  ): Promise<FlattenedScheduleItem[]>;

  getEmployeeFiltered(
    urlId: string,
    filter: ScheduleFilterOptions,
    options?: ReadOptions
  ): Promise<FlattenedScheduleItem[]>;

  getGroupExams(groupNumber: string, options?: ReadOptions): Promise<FlattenedScheduleItem[]>;
  getEmployeeExams(urlId: string, options?: ReadOptions): Promise<FlattenedScheduleItem[]>;

  getGroupRaw(groupNumber: string, options?: ReadOptions): Promise<ScheduleResponse>;
  getEmployeeRaw(urlId: string, options?: ReadOptions): Promise<ScheduleResponse>;

  getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions
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
    options?: ReadOptions
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

  /**
   * Calls IIS `/last-update-date/student-group`.
   *
   * @deprecated Legacy IIS endpoint; no longer maintained upstream. Six-digit
   * group numbers may fail. Prefer schedule date fields or your own cache TTL.
   * Planned for removal in a future major.
   */
  getLastUpdateByGroup(
    params: { groupNumber: string } | { id: number },
    options?: ReadOptions
  ): Promise<ApiDateResponse>;

  /**
   * Calls IIS `/last-update-date/employee`.
   *
   * @deprecated Legacy IIS endpoint; no longer maintained upstream. Prefer
   * schedule date fields or your own cache TTL. Planned for removal in a
   * future major.
   */
  getLastUpdateByEmployee(
    params: { urlId: string } | { id: number },
    options?: ReadOptions
  ): Promise<ApiDateResponse>;
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
    options: ReadOptions = {}
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
      endpoint: "/schedule"
    });
  }

  /**
   * Returns schedule for an employee.
   * Returns a normalized payload. Use `getEmployeeRaw` for the raw API envelope.
   */
  async function getEmployee(
    urlId: string,
    options: ReadOptions = {}
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
      endpoint
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
     * Use `getGroupBySubgroupRaw` / `getGroupBySubgroupEnvelope` for raw shapes.
     */
    getGroupBySubgroup: (id, subgroup, options) =>
      groupMethods.getBySubgroup(id, subgroup, options),
    /**
     * Returns raw `ScheduleItem[]` for a group subgroup (no day/source metadata).
     */
    getGroupBySubgroupRaw: (id, subgroup, options) =>
      groupMethods.getBySubgroupRaw(id, subgroup, options),
    /**
     * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
     * Preserves envelope fields (`employeeDto`, exams, date ranges).
     */
    getGroupBySubgroupEnvelope: (id, subgroup, options) =>
      groupMethods.getBySubgroupEnvelope(id, subgroup, options),
    /**
     * Returns flattened regular schedule lessons for an employee filtered by subgroup.
     * Use `getEmployeeBySubgroupRaw` / `getEmployeeBySubgroupEnvelope` for raw shapes.
     */
    getEmployeeBySubgroup: (id, subgroup, options) =>
      employeeMethods.getBySubgroup(id, subgroup, options),
    /**
     * Returns raw `ScheduleItem[]` for an employee subgroup filter.
     */
    getEmployeeBySubgroupRaw: (id, subgroup, options) =>
      employeeMethods.getBySubgroupRaw(id, subgroup, options),
    /**
     * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
     * Preserves envelope fields (`employeeDto`, exams, date ranges).
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
    getEmployeeExams: (id, options) => employeeMethods.getExams(id, options),

    /**
     * Calls IIS `/last-update-date/student-group`.
     *
     * @deprecated Legacy IIS endpoint; no longer maintained upstream. Six-digit
     * group numbers may fail. Prefer schedule date fields or your own cache TTL.
     * Planned for removal in a future major.
     */
    async getLastUpdateByGroup(
      params: { groupNumber: string } | { id: number },
      options: ReadOptions = {}
    ): Promise<ApiDateResponse> {
      let query: Record<string, string | number>;
      if ("groupNumber" in params) {
        assertGroupNumber(params.groupNumber, "groupNumber");
        query = { groupNumber: params.groupNumber };
      } else {
        assertPositiveInt(params.id, "id");
        query = { id: params.id };
      }
      const payload = await requestJson<unknown>(config, "/last-update-date/student-group", {
        query,
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses
          ? (value) => {
              assertApiDateResponse(value, "/last-update-date/student-group");
            }
          : undefined
      });
      return payload as ApiDateResponse;
    },

    /**
     * Calls IIS `/last-update-date/employee`.
     *
     * @deprecated Legacy IIS endpoint; no longer maintained upstream. Prefer
     * schedule date fields or your own cache TTL. Planned for removal in a
     * future major.
     */
    async getLastUpdateByEmployee(
      params: { urlId: string } | { id: number },
      options: ReadOptions = {}
    ): Promise<ApiDateResponse> {
      let query: Record<string, string | number>;
      if ("urlId" in params) {
        assertEmployeeUrlId(params.urlId, "urlId");
        query = { "url-id": params.urlId };
      } else {
        assertPositiveInt(params.id, "id");
        query = { id: params.id };
      }
      const payload = await requestJson<unknown>(config, "/last-update-date/employee", {
        query,
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses
          ? (value) => {
              assertApiDateResponse(value, "/last-update-date/employee");
            }
          : undefined
      });
      return payload as ApiDateResponse;
    }
  };
}
