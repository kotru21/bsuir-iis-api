import { WEEKDAYS, type Weekday } from "../types/common";
import { parseDdMmYyyyParts, type DdMmYyyyParts } from "../utils/date";
import { dayOfWeekFromOrdinal, toDayOrdinal } from "../utils/timeZone";

export const SUNDAY_LABEL = "Воскресенье";

/** `"YYYY-MM-DD"` key for a calendar date. */
export function toDateKey(parts: DdMmYyyyParts): string {
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Day ordinal of a BSUIR `dd.mm.yyyy` string, or `null` when missing/malformed. */
export function toLessonDayOrdinal(value: string | null): number | null {
  const parts = parseDdMmYyyyParts(value);
  return parts ? toDayOrdinal(parts) : null;
}

/** BSUIR weekday label of a day ordinal, or `null` for Sunday. */
export function toWeekday(ordinal: number): Weekday | null {
  const dayIndex = dayOfWeekFromOrdinal(ordinal);
  if (dayIndex < 1 || dayIndex > 6) {
    return null;
  }
  return WEEKDAYS[dayIndex - 1] ?? null;
}

/**
 * Validates and clones a Date. Only `Date` objects are accepted.
 * ISO strings like `"2026-05-15"` are NOT accepted to avoid UTC vs local timezone ambiguity —
 * pass an explicit `new Date(...)` instead.
 */
export function toDateOrThrow(value: Date, fieldName: string): Date {
  if (!(value instanceof Date)) {
    throw new TypeError(`'${fieldName}' must be a Date object`);
  }
  const cloned = new Date(value);
  if (Number.isNaN(cloned.getTime())) {
    throw new TypeError(`'${fieldName}' must be a valid Date`);
  }
  return cloned;
}

/** Whether `targetOrdinal` falls inside an optional inclusive `dd.mm.yyyy` date range. */
export function isWithinLessonDateRange(
  targetOrdinal: number,
  startDate: string | null,
  endDate: string | null
): boolean {
  const startOrdinal = toLessonDayOrdinal(startDate);
  if (startOrdinal !== null && targetOrdinal < startOrdinal) {
    return false;
  }
  const endOrdinal = toLessonDayOrdinal(endDate);
  return endOrdinal === null || !(targetOrdinal > endOrdinal);
}
