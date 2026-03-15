import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertNonEmptyString, assertPositiveInt } from "../utils/guards";
import type {
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleResponse
} from "../types/schedule";
import type { ApiDateResponse } from "../types/common";
import type { Weekday } from "../types/common";
import type { ReadOptions } from "./types";

const WEEKDAYS: Weekday[] = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота"
];

function normalizeSchedule(response: ScheduleResponse): NormalizedScheduleResponse {
  const lessons: FlattenedScheduleItem[] = [];
  const lessonsByDay: FlattenedLessonsByDay = {};
  for (const day of WEEKDAYS) {
    const dayItems = response.schedules[day] ?? [];
    const flattenedDayItems = dayItems.map((item) => ({ ...item, day, source: "schedules" as const }));
    lessonsByDay[day] = flattenedDayItems;
    for (const item of dayItems) {
      lessons.push({ ...item, day, source: "schedules" });
    }
  }

  for (const exam of response.exams) {
    lessons.push({
      ...exam,
      day: null,
      // Exams are not grouped by weekday in API response.
      source: "exams"
    });
  }

  const scheduleLessons = lessons.filter((lesson) => lesson.source === "schedules");
  const examLessons = lessons.filter((lesson) => lesson.source === "exams");

  return {
    ...response,
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

  if (typeof filter.weekNumber === "number" && !item.weekNumber.includes(filter.weekNumber)) {
    return false;
  }

  if (typeof filter.subgroup === "number" && item.numSubgroup !== filter.subgroup) {
    return false;
  }

  if (filter.lessonTypeAbbrev) {
    const types = Array.isArray(filter.lessonTypeAbbrev)
      ? filter.lessonTypeAbbrev
      : [filter.lessonTypeAbbrev];
    if (!types.includes(item.lessonTypeAbbrev)) {
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

  if (filter.auditory && !item.auditories.includes(filter.auditory)) {
    return false;
  }

  return true;
}

function filterLessons(
  response: NormalizedScheduleResponse,
  filter: ScheduleFilterOptions
): FlattenedScheduleItem[] {
  return response.lessons.filter((item) => matchesFilter(item, filter));
}

export function createScheduleModule(config: InternalClientConfig) {
  /**
   * Returns schedule for a student group.
   * By default returns normalized payload, unless `raw: true` is passed.
   */
  async function getGroup<TRaw extends boolean | undefined = undefined>(
    groupNumber: string,
    options: ReadOptions & { raw?: TRaw } = {}
  ): Promise<TRaw extends true ? ScheduleResponse : NormalizedScheduleResponse> {
    assertNonEmptyString(groupNumber, "groupNumber");
    const response = await requestJson<ScheduleResponse>(config, "/schedule", {
      query: { studentGroup: groupNumber },
      signal: options.signal
    });
    const result = options.raw ?? config.defaultRaw ? response : normalizeSchedule(response);
    return result as TRaw extends true ? ScheduleResponse : NormalizedScheduleResponse;
  }

  /**
   * Returns schedule for an employee.
   * By default returns normalized payload, unless `raw: true` is passed.
   */
  async function getEmployee<TRaw extends boolean | undefined = undefined>(
    urlId: string,
    options: ReadOptions & { raw?: TRaw } = {}
  ): Promise<TRaw extends true ? ScheduleResponse : NormalizedScheduleResponse> {
    assertNonEmptyString(urlId, "urlId");
    const response = await requestJson<ScheduleResponse>(config, `/employees/schedule/${urlId}`, {
      signal: options.signal
    });
    const result = options.raw ?? config.defaultRaw ? response : normalizeSchedule(response);
    return result as TRaw extends true ? ScheduleResponse : NormalizedScheduleResponse;
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

    async getCurrentWeek(options: ReadOptions = {}): Promise<number> {
      return requestJson<number>(config, "/schedule/current-week", { signal: options.signal });
    },

    async getLastUpdateByGroup(
      params: { groupNumber: string } | { id: number },
      options: ReadOptions = {}
    ): Promise<ApiDateResponse> {
      let query: Record<string, string | number>;
      if ("groupNumber" in params) {
        assertNonEmptyString(params.groupNumber, "groupNumber");
        query = { groupNumber: params.groupNumber };
      } else {
        assertPositiveInt(params.id, "id");
        query = { id: params.id };
      }
      return requestJson<ApiDateResponse>(config, "/last-update-date/student-group", {
        query,
        signal: options.signal
      });
    },

    async getLastUpdateByEmployee(
      params: { urlId: string } | { id: number },
      options: ReadOptions = {}
    ): Promise<ApiDateResponse> {
      let query: Record<string, string | number>;
      if ("urlId" in params) {
        assertNonEmptyString(params.urlId, "urlId");
        query = { "url-id": params.urlId };
      } else {
        assertPositiveInt(params.id, "id");
        query = { id: params.id };
      }
      return requestJson<ApiDateResponse>(config, "/last-update-date/employee", {
        query,
        signal: options.signal
      });
    }
  };
}
