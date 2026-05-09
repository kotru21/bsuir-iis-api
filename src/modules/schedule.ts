import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertApiDateResponse, assertScheduleResponse } from "../client/responseValidators";
import { assertEmployeeUrlId, assertGroupNumber, assertPositiveInt } from "../utils/guards";
import type {
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import type { ApiDateResponse } from "../types/common";
import type { Weekday } from "../types/common";
import type { ReadOptions } from "./types";
import { parseCurrentWeek } from "../utils/week";

const WEEKDAYS: Weekday[] = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота"
];

function lessonAuditories(item: ScheduleItem): string[] {
  const { auditories } = item;
  return Array.isArray(auditories) ? auditories : [];
}

type ScheduleResponseByRawOption<TRaw extends boolean | undefined, TRawDefault extends boolean> =
  TRaw extends true
    ? ScheduleResponse
    : TRaw extends false
      ? NormalizedScheduleResponse
      : TRawDefault extends true
        ? ScheduleResponse
        : NormalizedScheduleResponse;

/**
 * Transforms raw API schedule response into a normalized structure with flattened lessons.
 *
 * Raw API response contains lessons grouped by weekday (`schedules` object with day keys)
 * and exams in a separate array. This function flattens them into a single `lessons` array
 * for easier filtering and iteration, while preserving day-grouped view in `lessonsByDay`.
 *
 * @param response - Raw schedule response from API
 * @returns Normalized schedule with additional computed fields: `lessons` (flattened array),
 *          `lessonsByDay` (grouped by weekday), `scheduleLessons`, and `examLessons`
 *
 * @example
 * ```ts
 * const rawSchedule = await client.schedule.getGroup("053503", { raw: true });
 * const normalized = normalizeSchedule(rawSchedule);
 * console.log(normalized.lessons.length); // All lessons + exams flattened
 * console.log(normalized.lessonsByDay["Понедельник"]); // Monday-only lessons
 * console.log(normalized.scheduleLessons.length); // Only regular schedule
 * console.log(normalized.examLessons.length); // Only exams
 * ```
 */
export function normalizeSchedule(response: ScheduleResponse): NormalizedScheduleResponse {
  const lessons: FlattenedScheduleItem[] = [];
  const lessonsByDay: FlattenedLessonsByDay = {};
  const safeSchedules = response.schedules ?? {};
  const safeExams = response.exams ?? [];
  for (const day of WEEKDAYS) {
    const dayItems = safeSchedules[day] ?? [];
    const flattenedDayItems = dayItems.map((item) => {
      const auditories = lessonAuditories(item);
      return {
        ...item,
        auditories,
        day,
        source: "schedules" as const
      };
    });
    lessonsByDay[day] = flattenedDayItems;
    lessons.push(...flattenedDayItems);
  }

  for (const exam of safeExams) {
    const auditories = lessonAuditories(exam);
    lessons.push({
      ...exam,
      auditories,
      day: null,
      // Exams are not grouped by weekday in API response.
      source: "exams"
    });
  }

  const scheduleLessons = lessons.filter((lesson) => lesson.source === "schedules");
  const examLessons = lessons.filter((lesson) => lesson.source === "exams");

  return {
    ...response,
    schedules: safeSchedules,
    exams: safeExams,
    lessons,
    lessonsByDay,
    scheduleLessons,
    examLessons
  };
}

function matchesFilter(item: FlattenedScheduleItem, filter: ScheduleFilterOptions): boolean {
  if (filter.source && item.source !== filter.source) {
    return false;
  }

  if (filter.weekday && item.day !== filter.weekday) {
    return false;
  }

  if (typeof filter.weekNumber === "number") {
    if (!Array.isArray(item.weekNumber) || !item.weekNumber.includes(filter.weekNumber)) {
      return false;
    }
  }

  if (typeof filter.subgroup === "number" && item.numSubgroup !== filter.subgroup) {
    return false;
  }

  if (filter.lessonTypeAbbrev) {
    const types = Array.isArray(filter.lessonTypeAbbrev)
      ? filter.lessonTypeAbbrev
      : [filter.lessonTypeAbbrev];
    if (!item.lessonTypeAbbrev || !types.includes(item.lessonTypeAbbrev)) {
      return false;
    }
  }

  if (filter.subjectQuery) {
    const query = filter.subjectQuery.toLowerCase();
    const haystack = `${item.subject} ${item.subjectFullName} ${item.note ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filter.employeeUrlId) {
    const employeeMatch = item.employees?.some((employee) => employee.urlId === filter.employeeUrlId);
    if (!employeeMatch) {
      return false;
    }
  }

  if (filter.auditory && !lessonAuditories(item).includes(filter.auditory)) {
    return false;
  }

  return true;
}

/**
 * Filters normalized schedule lessons by specified criteria.
 *
 * @param response - Normalized schedule response containing lessons
 * @param filter - Filter options with optional fields: source, weekday, weekNumber, subgroup,
 *                 lessonTypeAbbrev, subjectQuery, employeeUrlId, auditory
 * @returns Array of lessons matching all provided filter criteria
 *
 * @example
 * ```ts
 * const schedule = await client.schedule.getGroup("053503");
 * const mondayLessons = filterLessons(schedule, { weekday: "Понедельник" });
 * const practiceLessons = filterLessons(schedule, { lessonTypeAbbrev: "пр" });
 * const lectureLessons = filterLessons(schedule, { lessonTypeAbbrev: ["лк", "лекция"] });
 * ```
 */
export function filterLessons(
  response: NormalizedScheduleResponse,
  filter: ScheduleFilterOptions
): FlattenedScheduleItem[] {
  return response.lessons.filter((item) => matchesFilter(item, filter));
}

export function createScheduleModule<TRawDefault extends boolean>(
  config: InternalClientConfig<TRawDefault>
) {
  /**
   * Returns schedule for a student group.
   * By default returns normalized payload, unless `raw: true` is passed.
   */
  async function getGroup<TRaw extends boolean | undefined = undefined>(
    groupNumber: string,
    options: ReadOptions & { raw?: TRaw } = {}
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>> {
    assertGroupNumber(groupNumber, "groupNumber");
    const payload = await requestJson<unknown>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: options.signal
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
   * By default returns normalized payload, unless `raw: true` is passed.
   */
  async function getEmployee<TRaw extends boolean | undefined = undefined>(
    urlId: string,
    options: ReadOptions & { raw?: TRaw } = {}
  ): Promise<ScheduleResponseByRawOption<TRaw, TRawDefault>> {
    assertEmployeeUrlId(urlId, "urlId");
    const endpoint = `/employees/schedule/${encodeURIComponent(urlId)}`;
    const payload = await requestJson<unknown>(
      config,
      endpoint,
      {
        signal: options.signal
      }
    );
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
    options: ReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    const normalized = await getGroup(groupNumber, { ...options, raw: false });
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
    const normalized = await getEmployee(urlId, { ...options, raw: false });
    return filterLessons(normalized, filter);
  }

  async function getCurrentWeek(options: ReadOptions = {}): Promise<number> {
    const payload = await requestJson<unknown>(config, "/schedule/current-week", {
      signal: options.signal
    });
    return parseCurrentWeek(payload);
  }

  return {
    getGroup,
    getEmployee,
    getGroupFiltered,
    getEmployeeFiltered,

    async getGroupExams(groupNumber: string, options: ReadOptions = {}): Promise<FlattenedScheduleItem[]> {
      return getGroupFiltered(groupNumber, { source: "exams" }, options);
    },

    async getEmployeeExams(urlId: string, options: ReadOptions = {}): Promise<FlattenedScheduleItem[]> {
      return getEmployeeFiltered(urlId, { source: "exams" }, options);
    },

    async getGroupBySubgroup(
      groupNumber: string,
      subgroup: number,
      options: ReadOptions = {}
    ): Promise<FlattenedScheduleItem[]> {
      assertPositiveInt(subgroup, "subgroup");
      return getGroupFiltered(groupNumber, { source: "schedules", subgroup }, options);
    },

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
     * Calls IIS `/last-update-date/student-group`. That route is legacy and unsupported on the server;
     * it may return an error for newer group numbers (e.g. six-digit `524404`).
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
        signal: options.signal
      });
      if (config.validateResponses) {
        assertApiDateResponse(payload, "/last-update-date/student-group");
      }
      return payload as ApiDateResponse;
    },

    /**
     * Calls IIS `/last-update-date/employee`. That route is legacy and unsupported on the server; prefer
     * not relying on it for critical cache logic.
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
        signal: options.signal
      });
      if (config.validateResponses) {
        assertApiDateResponse(payload, "/last-update-date/employee");
      }
      return payload as ApiDateResponse;
    }
  };
}
