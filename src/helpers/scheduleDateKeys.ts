import { WEEKDAYS, type Weekday } from "../types/common";
import { parseDdMmYyyyParts, type DdMmYyyyParts } from "../utils/date";

export const SUNDAY_LABEL = "Воскресенье";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 *
 */
export function toDayOrdinal(parts: DdMmYyyyParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

/**
 *
 */
export function toDateDayOrdinal(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

/**
 *
 */
export function toDateKey(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 *
 */
export function toLessonDateKey(value: string | null): string | null {
  const parts = parseDdMmYyyyParts(value);
  if (!parts) {
    return null;
  }
  return `${String(parts.year)}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 *
 */
export function toLessonDayOrdinal(value: string | null): number | null {
  const parts = parseDdMmYyyyParts(value);
  return parts ? toDayOrdinal(parts) : null;
}

/**
 *
 */
export function toWeekday(date: Date): Weekday | null {
  const dayIndex = date.getDay();
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

/**
 *
 */
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
