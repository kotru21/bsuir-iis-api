import { requestJson } from "../client/http";
import { assertApiDateResponse, assertScheduleResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { ApiDateResponse } from "../types/common";
import type {
  FlattenedScheduleItem,
  ScheduleFilterOptions,
  ScheduleResponse,
  NormalizedScheduleResponse,
} from "../types/schedule";
import { assertEmployeeUrlId, assertGroupNumber, assertPositiveInt } from "../utils/guards";
import { parseCurrentWeek } from "../utils/week";
import { filterLessons } from "./scheduleFilter";
import { normalizeSchedule } from "./scheduleNormalize";
import type { ReadOptions } from "./types";

type ScheduleResponseByRawOption<TRaw extends boolean | undefined, TRawDefault extends boolean> =
  TRaw extends true
    ? ScheduleResponse
    : TRaw extends false
      ? NormalizedScheduleResponse
      : TRawDefault extends true
        ? ScheduleResponse
        : NormalizedScheduleResponse;

/**
 * Creates schedule API module with raw/normalized response support.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createScheduleModule<TRawDefault extends boolean>(
  config: Readonly<InternalClientConfig<TRawDefault>>,
) {
  /**
   * Returns schedule for a student group.
   * By default returns normalized payload unless `raw: true` is passed.
   */
  async function getGroup<TRaw extends boolean | undefined = undefined>(
    groupNumber: string,
    options: ReadOptions & { raw?: TRaw } = {},
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>> {
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: options.signal,
    });
    if (config.validateResponses) {
      assertScheduleResponse(payload, "/schedule");
    }
    const response = payload as ScheduleResponse;
    const result = options.raw ?? config.defaultRaw ? response : normalizeSchedule(response);
    return result as ScheduleResponseByRawOption<TRaw, TRawDefault>;
  }

  /**
   * Returns schedule for an employee.
   * By default returns normalized payload unless `raw: true` is passed.
   */
  async function getEmployee<TRaw extends boolean | undefined = undefined>(
    urlId: string,
    options: ReadOptions & { raw?: TRaw } = {},
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>> {
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(config, endpoint, { signal: options.signal });
    if (config.validateResponses) {
      assertScheduleResponse(payload, endpoint);
    }
    const response = payload as ScheduleResponse;
    const result = options.raw ?? config.defaultRaw ? response : normalizeSchedule(response);
    return result as ScheduleResponseByRawOption<TRaw, TRawDefault>;
  }

  /**
   * Returns filtered schedule items for a group from normalized schedule payload.
   */
  async function getGroupFiltered(
    groupNumber: string,
    filter: ScheduleFilterOptions,
    options: ReadOptions = {},
  ): Promise<FlattenedScheduleItem[]> {
    const schedule = await getGroup(groupNumber, { ...options, raw: false });
    return filterLessons(schedule, filter);
  }

  /**
   * Returns filtered schedule items for an employee from normalized schedule payload.
   */
  async function getEmployeeFiltered(
    urlId: string,
    filter: ScheduleFilterOptions,
    options: ReadOptions = {},
  ): Promise<FlattenedScheduleItem[]> {
    const schedule = await getEmployee(urlId, { ...options, raw: false });
    return filterLessons(schedule, filter);
  }

  /**
   * Returns the current academic week number.
   */
  async function getCurrentWeek(options: ReadOptions = {}): Promise<number> {
    const payload = await requestJson<unknown>(config, "/schedule/current-week", {
      signal: options.signal,
    });
    if (config.validateResponses) {
      assertApiDateResponse(payload, "/schedule/current-week");
    }
    return parseCurrentWeek(payload as ApiDateResponse);
  }

  return {
    getGroup,
    getEmployee,
    getGroupFiltered,
    getEmployeeFiltered,

    /**
     * Returns exams for a group.
     */
    async getGroupExams(groupNumber: string, options: ReadOptions = {}): Promise<FlattenedScheduleItem[]> {
      return getGroupFiltered(groupNumber, { source: "exams" }, options);
    },

    /**
     * Returns exams for an employee.
     */
    async getEmployeeExams(urlId: string, options: ReadOptions = {}): Promise<FlattenedScheduleItem[]> {
      return getEmployeeFiltered(urlId, { source: "exams" }, options);
    },

    /**
     * Returns schedule lessons for a group, optionally filtered by subgroup.
     */
    async getGroupSchedule(
      groupNumber: string,
      subgroup?: number,
      options: ReadOptions = {},
    ): Promise<FlattenedScheduleItem[]> {
      return getGroupFiltered(groupNumber, { source: "schedules", subgroup }, options);
    },

    /**
     * Returns schedule lessons for an employee, optionally filtered by subgroup.
     */
    async getEmployeeSchedule(
      urlId: string,
      subgroup?: number,
      options: ReadOptions = {},
    ): Promise<FlattenedScheduleItem[]> {
      return getEmployeeFiltered(urlId, { source: "schedules", subgroup }, options);
    },

    getCurrentWeek,
  };
}
