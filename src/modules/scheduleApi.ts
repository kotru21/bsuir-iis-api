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
import { filterLessons } from "./scheduleFilter";
import { normalizeSchedule } from "./scheduleNormalize";
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

function filterRawSubgroupLessons(response: ScheduleResponse, subgroup: number): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const schedules = response.schedules ?? {};
  for (const dayItems of Object.values(schedules)) {
    for (const lesson of dayItems) {
      if (lesson.numSubgroup === subgroup) {
        items.push(structuredClone(lesson));
      }
    }
  }
  return items;
}

function filterRawSubgroupEnvelope(response: ScheduleResponse, subgroup: number): ScheduleResponse {
  const cloned = structuredClone(response);
  const schedules = cloned.schedules ?? {};
  for (const day of Object.keys(schedules) as (keyof typeof schedules)[]) {
    const items = schedules[day] ?? [];
    schedules[day] = items.filter((lesson) => lesson.numSubgroup === subgroup);
  }
  return cloned;
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
   * Returns filtered schedule items for a group from normalized schedule payload.
   */
  async function getGroupFiltered(
    groupNumber: string,
    filter: ScheduleFilterOptions,
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    const normalized = await getGroup(groupNumber, {
      signal: options.signal,
      cache: options.cache
    });
    return filterLessons(normalized, filter);
  }

  /**
   * Returns filtered schedule items for an employee from normalized schedule payload.
   */
  async function getEmployeeFiltered(
    urlId: string,
    filter: ScheduleFilterOptions,
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    const normalized = await getEmployee(urlId, {
      signal: options.signal,
      cache: options.cache
    });
    return filterLessons(normalized, filter);
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

  /**
   * Returns flattened regular schedule lessons for a subgroup.
   * Use `getGroupBySubgroupRaw` / `getGroupBySubgroupEnvelope` for raw shapes.
   */
  async function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    return getGroupFiltered(groupNumber, { source: "schedules", subgroup }, options);
  }

  /**
   * Returns raw `ScheduleItem[]` for a group subgroup (no day/source metadata).
   */
  async function getGroupBySubgroupRaw(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await getGroupRaw(groupNumber, options);
    return filterRawSubgroupLessons(raw, subgroup);
  }

  /**
   * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
   * Preserves envelope fields (`employeeDto`, exams, date ranges).
   */
  async function getGroupBySubgroupEnvelope(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await getGroupRaw(groupNumber, options);
    return filterRawSubgroupEnvelope(raw, subgroup);
  }

  /**
   * Returns flattened regular schedule lessons for an employee filtered by subgroup.
   * Use `getEmployeeBySubgroupRaw` / `getEmployeeBySubgroupEnvelope` for raw shapes.
   */
  async function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    return getEmployeeFiltered(urlId, { source: "schedules", subgroup }, options);
  }

  /**
   * Returns raw `ScheduleItem[]` for an employee subgroup filter.
   */
  async function getEmployeeBySubgroupRaw(
    urlId: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await getEmployeeRaw(urlId, options);
    return filterRawSubgroupLessons(raw, subgroup);
  }

  /**
   * Returns the full `ScheduleResponse` with `schedules` arrays filtered to the subgroup.
   * Preserves envelope fields (`employeeDto`, exams, date ranges).
   */
  async function getEmployeeBySubgroupEnvelope(
    urlId: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await getEmployeeRaw(urlId, options);
    return filterRawSubgroupEnvelope(raw, subgroup);
  }

  return {
    getGroup,
    getEmployee,
    getGroupRaw,
    getEmployeeRaw,
    getGroupFiltered,
    getEmployeeFiltered,
    getGroupBySubgroup,
    getGroupBySubgroupRaw,
    getGroupBySubgroupEnvelope,
    getEmployeeBySubgroup,
    getEmployeeBySubgroupRaw,
    getEmployeeBySubgroupEnvelope,
    getCurrentWeek,

    /**
     * Returns exams for a group.
     */
    async getGroupExams(
      groupNumber: string,
      options: ReadOptions = {}
    ): Promise<FlattenedScheduleItem[]> {
      return getGroupFiltered(groupNumber, { source: "exams" }, options);
    },

    /**
     * Returns exams for an employee.
     */
    async getEmployeeExams(
      urlId: string,
      options: ReadOptions = {}
    ): Promise<FlattenedScheduleItem[]> {
      return getEmployeeFiltered(urlId, { source: "exams" }, options);
    },

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
