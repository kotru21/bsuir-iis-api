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

type DefaultScheduleResponse<TRawDefault extends boolean> = TRawDefault extends true
  ? ScheduleResponse
  : NormalizedScheduleResponse;

export interface ScheduleModule<TRawDefault extends boolean> {
  getGroup(
    groupNumber: string,
    options: ReadOptions & { raw: true }
  ): Promise<ScheduleResponse>;
  getGroup(
    groupNumber: string,
    options: ReadOptions & { raw: false }
  ): Promise<NormalizedScheduleResponse>;
  getGroup(
    groupNumber: string,
    options?: ReadOptions & { raw?: undefined }
  ): Promise<DefaultScheduleResponse<TRawDefault>>;
  getGroup(
    groupNumber: string,
    options: ReadOptions & { raw: boolean }
  ): Promise<ScheduleResponse | NormalizedScheduleResponse>;

  getEmployee(
    urlId: string,
    options: ReadOptions & { raw: true }
  ): Promise<ScheduleResponse>;
  getEmployee(
    urlId: string,
    options: ReadOptions & { raw: false }
  ): Promise<NormalizedScheduleResponse>;
  getEmployee(
    urlId: string,
    options?: ReadOptions & { raw?: undefined }
  ): Promise<DefaultScheduleResponse<TRawDefault>>;
  getEmployee(
    urlId: string,
    options: ReadOptions & { raw: boolean }
  ): Promise<ScheduleResponse | NormalizedScheduleResponse>;

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
export function createScheduleModule<TRawDefault extends boolean>(
  config: Readonly<InternalClientConfig<TRawDefault>>
): ScheduleModule<TRawDefault> {
  /**
   * Returns schedule for a student group.
   * By default returns normalized payload unless `raw: true` is passed.
   */
  async function getGroup(
    groupNumber: string,
    options?: ReadOptions & { raw?: boolean }
  ): Promise<ScheduleResponse | NormalizedScheduleResponse> {
    const resolvedOptions = options ?? {};
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: resolvedOptions.signal,
      cache: resolvedOptions.cache
    });
    const returnRaw = resolvedOptions.raw ?? config.defaultRaw;
    if (config.validateResponses && returnRaw) {
      assertScheduleResponse(payload, "/schedule");
    }
    const response = payload as ScheduleResponse;
    if (returnRaw) {
      return response;
    }
    return normalizeSchedule(response, {
      validate: config.validateResponses,
      endpoint: "/schedule"
    });
  }

  /**
   * Returns schedule for an employee.
   * By default returns normalized payload unless `raw: true` is passed.
   */
  async function getEmployee(
    urlId: string,
    options?: ReadOptions & { raw?: boolean }
  ): Promise<ScheduleResponse | NormalizedScheduleResponse> {
    const resolvedOptions = options ?? {};
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(config, endpoint, {
      signal: resolvedOptions.signal,
      cache: resolvedOptions.cache
    });
    const returnRaw = resolvedOptions.raw ?? config.defaultRaw;
    if (config.validateResponses && returnRaw) {
      assertScheduleResponse(payload, endpoint);
    }
    const response = payload as ScheduleResponse;
    if (returnRaw) {
      return response;
    }
    return normalizeSchedule(response, {
      validate: config.validateResponses,
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
      cache: options.cache,
      raw: false
    }) as NormalizedScheduleResponse;
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
      cache: options.cache,
      raw: false
    }) as NormalizedScheduleResponse;
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
  async function getGroupBySubgroup(
    groupNumber: string,
    subgroup: number,
    options?: ReadOptions & { raw?: boolean; rawEnvelope?: boolean }
  ): Promise<FlattenedScheduleItem[] | ScheduleItem[] | ScheduleResponse> {
    const resolvedOptions = options ?? {};
    assertPositiveInt(subgroup, "subgroup");
    if (resolvedOptions.rawEnvelope === true) {
      const raw = await getGroup(groupNumber, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache,
        raw: true
      });
      return filterRawSubgroupEnvelope(raw, subgroup);
    }
    if (resolvedOptions.raw === true) {
      const raw = await getGroup(groupNumber, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache,
        raw: true
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
  async function getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ReadOptions & { raw?: boolean; rawEnvelope?: boolean }
  ): Promise<FlattenedScheduleItem[] | ScheduleItem[] | ScheduleResponse> {
    const resolvedOptions = options ?? {};
    assertPositiveInt(subgroup, "subgroup");
    if (resolvedOptions.rawEnvelope === true) {
      const raw = await getEmployee(urlId, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache,
        raw: true
      });
      return filterRawSubgroupEnvelope(raw, subgroup);
    }
    if (resolvedOptions.raw === true) {
      const raw = await getEmployee(urlId, {
        signal: resolvedOptions.signal,
        cache: resolvedOptions.cache,
        raw: true
      });
      return filterRawSubgroupLessons(raw, subgroup);
    }
    return getEmployeeFiltered(urlId, { source: "schedules", subgroup }, resolvedOptions);
  }

  return {
    getGroup: getGroup as ScheduleModule<TRawDefault>["getGroup"],
    getEmployee: getEmployee as ScheduleModule<TRawDefault>["getEmployee"],
    getGroupFiltered,
    getEmployeeFiltered,
    getGroupBySubgroup: getGroupBySubgroup as ScheduleModule<TRawDefault>["getGroupBySubgroup"],
    getEmployeeBySubgroup:
      getEmployeeBySubgroup as ScheduleModule<TRawDefault>["getEmployeeBySubgroup"],
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
