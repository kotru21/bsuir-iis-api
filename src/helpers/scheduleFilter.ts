import { assertPositiveInt } from "../utils/guards";
import { lessonAuditories } from "../utils/lessonAuditories";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions
} from "../types/schedule";

/**
 * Whether a lesson belongs to `subgroup`.
 *
 * IIS uses `numSubgroup === 0` for lessons shared by every subgroup; those
 * match any positive subgroup filter.
 */
export function lessonMatchesSubgroup(numSubgroup: number, subgroup: number): boolean {
  return numSubgroup === 0 || numSubgroup === subgroup;
}

/**
 * Whether a lesson takes place in study week `week`.
 *
 * Mirrors the date helpers (`getLessonsForDate`): a weekly timetable row with a
 * `null` / empty `weekNumber` runs every week (the way `formatLessonWeekNumbers`
 * labels it "кажд. нед."). Exams and rows pinned to a `dateLesson` belong to a
 * calendar date, not to a week of the cycle, so they only match an explicit list.
 */
function lessonRunsInWeek(item: FlattenedScheduleItem, week: number): boolean {
  if (Array.isArray(item.weekNumber) && item.weekNumber.length > 0) {
    return item.weekNumber.includes(week);
  }
  return item.source !== "exams" && !item.dateLesson;
}

/**
 * Whether a flattened lesson matches every criterion of `filter` (internal; shared by
 * {@link filterLessons} and `normalizeSchedule({ filter })`). Call
 * {@link assertScheduleFilter} once before matching many lessons.
 */
export function lessonMatchesFilter(
  item: FlattenedScheduleItem,
  filter: ScheduleFilterOptions
): boolean {
  if (filter.source && item.source !== filter.source) {
    return false;
  }

  if (filter.weekday && item.day !== filter.weekday) {
    return false;
  }

  if (typeof filter.weekNumber === "number" && !lessonRunsInWeek(item, filter.weekNumber)) {
    return false;
  }

  if (
    typeof filter.subgroup === "number" &&
    !lessonMatchesSubgroup(item.numSubgroup, filter.subgroup)
  ) {
    return false;
  }

  // A non-empty string or list filters; `""` / `[]` mean "no type filter" (an empty list
  // used to exclude every lesson, e.g. when a UI multi-select was cleared).
  const types: readonly string[] =
    typeof filter.lessonTypeAbbrev === "string"
      ? [filter.lessonTypeAbbrev].filter((type) => type.length > 0)
      : (filter.lessonTypeAbbrev ?? []);
  if (types.length > 0 && (!item.lessonTypeAbbrev || !types.includes(item.lessonTypeAbbrev))) {
    return false;
  }

  if (filter.subjectQuery) {
    const query = filter.subjectQuery.toLowerCase();
    // Sparse/announcement rows may lack names: never let "null"/"undefined" become searchable text.
    const haystack = [item.subject, item.subjectFullName, item.note]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filter.employeeUrlId) {
    const employeeMatch = item.employees?.some(
      (employee) => employee.urlId === filter.employeeUrlId
    );
    if (!employeeMatch) {
      return false;
    }
  }

  return !filter.auditory || lessonAuditories(item).includes(filter.auditory);
}

/**
 * Filters normalized schedule lessons by criteria.
 */
export function filterLessons(
  response: NormalizedScheduleResponse,
  filter: ScheduleFilterOptions
): FlattenedScheduleItem[] {
  assertScheduleFilter(filter);
  return response.lessons.filter((item) => lessonMatchesFilter(item, filter));
}

/** Validates the numeric criteria of a filter (`weekNumber`, `subgroup`). */
export function assertScheduleFilter(filter: ScheduleFilterOptions): void {
  if (typeof filter.weekNumber === "number") {
    assertPositiveInt(filter.weekNumber, "filter.weekNumber");
  }
  if (typeof filter.subgroup === "number") {
    assertPositiveInt(filter.subgroup, "filter.subgroup");
  }
}
