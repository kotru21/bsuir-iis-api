import { assertPositiveInt } from "../utils/guards";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
} from "../types/schedule";

function lessonAuditories(item: ScheduleItem): string[] {
  const { auditories } = item;
  return Array.isArray(auditories) ? auditories : [];
}

function matchesFilter(item: FlattenedScheduleItem, filter: ScheduleFilterOptions): boolean {
  if (filter.source && item.source !== filter.source) {
    return false;
  }

  if (filter.weekday && item.day !== filter.weekday) {
    return false;
  }

  if (typeof filter.weekNumber === "number" && (!Array.isArray(item.weekNumber) || !item.weekNumber.includes(filter.weekNumber))) {
      return false;
    }

  if (typeof filter.subgroup === "number" && item.numSubgroup !== 0 && item.numSubgroup !== filter.subgroup) {
    return false;
  }

  if (filter.lessonType && item.lessonTypeAbbrev !== filter.lessonType) {
    return false;
  }

  if (filter.auditory) {
    const normalizedFilter = filter.auditory.toLowerCase();
    const auds = lessonAuditories(item);
    if (!auds.some((a) => a.toLowerCase().includes(normalizedFilter))) {
      return false;
    }
  }

  return true;
}

/**
 * Filters a normalized schedule by the provided filter options.
 * @public
 */
export function filterLessons(
  schedule: NormalizedScheduleResponse,
  filter: ScheduleFilterOptions,
): FlattenedScheduleItem[] {
  if (typeof filter.weekNumber === "number") {
    assertPositiveInt(filter.weekNumber, "weekNumber");
  }
  return schedule.lessons.filter((item) => matchesFilter(item, filter));
}
