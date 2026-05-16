import { requestJson } from "../client/http";
import { assertApiDateResponse, assertScheduleResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { ApiDateResponse } from "../types/common";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleResponse
} from "../types/schedule";
import { assertEmployeeUrlId, assertGroupNumber, assertPositiveInt } from "../utils/guards";
import { parseCurrentWeek } from "../utils/week";
import { filterLessons } from "./scheduleFilter";
import { normalizeSchedule } from "./scheduleNormalize";
import type { ReadOptions } from "./types";

type ScheduleResponseByRawOption<
  TRaw extends boolean | undefined,
  TRawDefault extends boolean
> = TRaw extends true
  ? ScheduleResponse
  : TRaw extends false
    ? NormalizedScheduleResponse
    : TRawDefault extends true
      ? ScheduleResponse
      : NormalizedScheduleResponse;

export interface ScheduleModule<TRawDefault extends boolean> {
  getGroup<TRaw extends boolean | undefined = undefined>(
    groupNumber: string,
    options?: ReadOptions & { raw?: TRaw }
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>>;

  getEmployee<TRaw extends boolean | undefined = undefined>(
    urlId: string,
    options?: ReadOptions & { raw?: TRaw }
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>>;

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
    options?: ReadOptions
  ): Promise<FlattenedScheduleItem[]>;

  getEmployeeBySubgroup(
    urlId: string,
    subgroup: number,
    options?: ReadOptions
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
  async function getGroup<TRaw extends boolean | undefined = undefined>(
    groupNumber: string,
    options: ReadOptions & { raw?: TRaw } = {}
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>> {
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: options.signal,
      cache: options.cache
    });
    if (config.validateResponses) {
      assertScheduleResponse(payload, "/schedule");
    }
    const response = payload as ScheduleResponse;
    const result = (options.raw ?? config.defaultRaw) ? response : normalizeSchedule(response);
    return result as ScheduleResponseByRawOption<TRaw, TRawDefault>;
  }

  /**
   * Returns schedule for an employee.
   * By default returns normalized payload unless `raw: true` is passed.
   */
  async function getEmployee<TRaw extends boolean | undefined = undefined>(
    urlId: string,
    options: ReadOptions & { raw?: TRaw } = {}
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>> {
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(config, endpoint, {
      signal: options.signal,
      cache: options.cache
    });
    if (config.validateResponses) {
      assertScheduleResponse(payload, endpoint);
    }
    const response = payload as ScheduleResponse;
    const result = (options.raw ?? config.defaultRaw) ? response : normalizeSchedule(response);
    return result as ScheduleResponseByRawOption<TRaw, TRawDefault>;
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
      cache: options.cache,
      raw: false
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

  return {
    getGroup,
    getEmployee,
    getGroupFiltered,
    getEmployeeFiltered,

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
     * Returns regular schedule lessons of a specific subgroup for a group.
     */
    async getGroupBySubgroup(
      groupNumber: string,
      subgroup: number,
      options: ReadOptions = {}
    ): Promise<FlattenedScheduleItem[]> {
      assertPositiveInt(subgroup, "subgroup");
      return getGroupFiltered(groupNumber, { source: "schedules", subgroup }, options);
    },

    /**
     * Returns regular schedule lessons of a specific subgroup for an employee.
     */
    async getEmployeeBySubgroup(
      urlId: string,
      subgroup: number,
      options: ReadOptions = {}
    ): Promise<FlattenedScheduleItem[]> {
      assertPositiveInt(subgroup, "subgroup");
      return getEmployeeFiltered(urlId, { source: "schedules", subgroup }, options);
    },

    getCurrentWeek,

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
