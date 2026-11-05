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

function matchesFilter(item: FlattenedScheduleItem, filter: ScheduleFilterOptions): boolean {
  if (filter.source && item.source !== filter.source) {
    return false;
  }

  if (filter.weekday && item.day !== filter.weekday) {
    return false;
  }

  if (
    typeof filter.weekNumber === "number" &&
    (!Array.isArray(item.weekNumber) || !item.weekNumber.includes(filter.weekNumber))
  ) {
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
  if (typeof filter.weekNumber === "number") {
    assertPositiveInt(filter.weekNumber, "filter.weekNumber");
  }
  if (typeof filter.subgroup === "number") {
    assertPositiveInt(filter.subgroup, "filter.subgroup");
  }
  return response.lessons.filter((item) => matchesFilter(item, filter));
}
