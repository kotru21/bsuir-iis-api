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
