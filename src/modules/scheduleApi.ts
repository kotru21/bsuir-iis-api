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

  // Explicit raw/envelope helpers (new explicit API)
  getGroupRaw(groupNumber: string, options?: ReadOptions): Promise<ScheduleResponse>;
  getGroupEnvelope(groupNumber: string, subgroup: number, options?: ReadOptions): Promise<ScheduleResponse>;

  getEmployeeRaw(urlId: string, options?: ReadOptions): Promise<ScheduleResponse>;
  getEmployeeEnvelope(urlId: string, subgroup: number, options?: ReadOptions): Promise<ScheduleResponse>;

  getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions & { rawEnvelope: true }
  ): Promise<ScheduleResponse>;
  getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions & { raw: true; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[]>;
  getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions & { raw: boolean; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[] | FlattenedScheduleItem[]>;
  getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions & { raw?: false | undefined; rawEnvelope?: false | undefined }
  ): Promise<FlattenedScheduleItem[]>;

  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions & { rawEnvelope: true }
  ): Promise<ScheduleResponse>;
  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions & { raw: true; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[]>;
  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions & { raw: boolean; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[] | FlattenedScheduleItem[]>;
  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ReadOptions & { raw?: false | undefined; rawEnvelope?: false | undefined }
  ): Promise<FlattenedScheduleItem[]>;

  getCurrentWeek(options?: ReadOptions): Promise<number>;

  getLastUpdateByGroup(
    params: { groupNumber: string } | { id: number },
    options?: ReadOptions
  ): Promise<ApiDateResponse>;

  getLastUpdateByEmployee(
    params: { urlId: string } | { id: number },
    options?: ReadOptions
  ): Promise<ApiDateResponse>;
}

function filterRawSubgroupLessons(
  response: ScheduleResponse,
  subgroup: number
): ScheduleItem[] {
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

function filterRawSubgroupEnvelope(
  response: ScheduleResponse,
  subgroup: number
): ScheduleResponse {
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
export function createScheduleModule(
  config: Readonly<InternalClientConfig>
): ScheduleModule {
  /**
   * Returns schedule for a student group.
   * Returns a normalized payload. Use `getGroupRaw` for the raw API envelope.
   */
  async function getGroup(groupNumber: string, options: ReadOptions = {}): Promise<NormalizedScheduleResponse> {
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
  async function getEmployee(urlId: string, options: ReadOptions = {}): Promise<NormalizedScheduleResponse> {
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

  /**
   * Returns regular schedule lessons for a subgroup.
   *
   * Shape selection:
   * - `rawEnvelope: true` → returns the full `ScheduleResponse` with `schedules` arrays
   *   filtered to the requested subgroup. Preserves `employeeDto`, `studentGroupDto`,
   *   exam fields, and date ranges from the original envelope.
   * - `raw: true` (without `rawEnvelope`) → returns `ScheduleItem[]` only.
   * - default → returns flattened `FlattenedScheduleItem[]` with day/source metadata.
   */
  function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions & { rawEnvelope: true }
  ): Promise<ScheduleResponse>;
  function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions & { raw: true; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[]>;
  function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options: ReadOptions & { raw: boolean; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[] | FlattenedScheduleItem[]>;
  function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions & { raw?: false | undefined; rawEnvelope?: false | undefined }
  ): Promise<FlattenedScheduleItem[]>;
  async function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions & { raw?: boolean | undefined; rawEnvelope?: boolean | undefined }
  ): Promise<FlattenedScheduleItem[] | ScheduleItem[] | ScheduleResponse> {
    const resolvedOptions = options ?? {};
    assertPositiveInt(subgroup, "subgroup");
    if (resolvedOptions.rawEnvelope === true) {
      const raw = await getGroupRaw(groupNumber, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache
      });
      return filterRawSubgroupEnvelope(raw, subgroup);
    }
    if (resolvedOptions.raw === true) {
      const raw = await getGroupRaw(groupNumber, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache
      });
      return filterRawSubgroupLessons(raw, subgroup);
    }
    return getGroupFiltered(groupNumber, { source: "schedules", subgroup }, resolvedOptions);
  }

  /**
   * Returns regular schedule lessons for an employee subgroup filter.
   *
   * Shape selection:
   * - `rawEnvelope: true` → returns the full `ScheduleResponse` with `schedules` arrays
   *   filtered to the requested subgroup. Preserves `employeeDto`, `studentGroupDto`,
   *   exam fields, and date ranges from the original envelope.
   * - `raw: true` (without `rawEnvelope`) → returns `ScheduleItem[]` only.
   * - default → returns flattened `FlattenedScheduleItem[]` with day/source metadata.
   */
  function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions & { rawEnvelope: true }
  ): Promise<ScheduleResponse>;
  function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions & { raw: true; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[]>;
  function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options: ReadOptions & { raw: boolean; rawEnvelope?: false | undefined }
  ): Promise<ScheduleItem[] | FlattenedScheduleItem[]>;
  function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ReadOptions & { raw?: false | undefined; rawEnvelope?: false | undefined }
  ): Promise<FlattenedScheduleItem[]>;
  async function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ReadOptions & { raw?: boolean | undefined; rawEnvelope?: boolean | undefined }
  ): Promise<FlattenedScheduleItem[] | ScheduleItem[] | ScheduleResponse> {
    const resolvedOptions = options ?? {};
    assertPositiveInt(subgroup, "subgroup");
    if (resolvedOptions.rawEnvelope === true) {
      const raw = await getEmployeeRaw(urlId, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache
      });
      return filterRawSubgroupEnvelope(raw, subgroup);
    }
    if (resolvedOptions.raw === true) {
      const raw = await getEmployeeRaw(urlId, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache
      });
      return filterRawSubgroupLessons(raw, subgroup);
    }
    return getEmployeeFiltered(urlId, { source: "schedules", subgroup }, resolvedOptions);
  }

  // Explicit helpers: raw/envelope variants to make API shape explicit.
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

  async function getGroupEnvelope(groupNumber: string, subgroup: number, options: ReadOptions = {}) {
    const raw = await getGroupRaw(groupNumber, options);
    return filterRawSubgroupEnvelope(raw, subgroup);
  }

  async function getEmployeeRaw(urlId: string, options: ReadOptions = {}) {
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

  async function getEmployeeEnvelope(urlId: string, subgroup: number, options: ReadOptions = {}) {
    const raw = await getEmployeeRaw(urlId, options);
    return filterRawSubgroupEnvelope(raw, subgroup);
  }

  return {
    getGroup,
    getEmployee,
    getGroupRaw,
    getGroupEnvelope,
    getEmployeeRaw,
    getEmployeeEnvelope,
    getGroupFiltered,
    getEmployeeFiltered,
    getGroupBySubgroup,
    getEmployeeBySubgroup,
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
        cache: options.cache
      });
      if (config.validateResponses) {
        assertApiDateResponse(payload, "/last-update-date/student-group");
      }
      return payload as ApiDateResponse;
    },

    /**
     * Calls IIS `/last-update-date/employee`.
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
        cache: options.cache
      });
      if (config.validateResponses) {
        assertApiDateResponse(payload, "/last-update-date/employee");
      }
      return payload as ApiDateResponse;
    }
  };
}
