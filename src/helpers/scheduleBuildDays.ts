import { filterLessons } from "./scheduleFilter";
import { WEEKDAYS } from "../types/common";
import type {
  BuildScheduleDaysOptions,
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleDay
} from "../types/schedule";
import { parseDdMmYyyyParts } from "../utils/date";
import { assertPositiveInt } from "../utils/guards";
import {
  getCurrentLesson,
  getNextLesson,
  sortLessonsByTime,
  type InvalidLessonTimeHook
} from "./scheduleCurrentNext";
import {
  isWithinLessonDateRange,
  SUNDAY_LABEL,
  toDateDayOrdinal,
  toDateKey,
  toDateOrThrow,
  toDayOrdinal,
  toLessonDateKey,
  toWeekday
} from "./scheduleDateKeys";

function createEmptyLessonsByDay(): FlattenedLessonsByDay {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as FlattenedLessonsByDay;
}

function usesFourWeekCycle(response: NormalizedScheduleResponse): boolean {
  const values = response.scheduleLessons
    .flatMap((lesson) => lesson.weekNumber ?? [])
    .filter((value): value is number => Number.isSafeInteger(value) && value > 0);
  if (values.length === 0) {
    return false;
  }
  return values.every((value) => value >= 1 && value <= 4);
}

function inferWeekNumberForDate(response: NormalizedScheduleResponse, date: Date): number | null {
  const startDateParts = parseDdMmYyyyParts(response.startDate);
  if (!startDateParts) {
    return null;
  }
  const startOrdinal = toDayOrdinal(startDateParts);
  const targetOrdinal = toDateDayOrdinal(date);
  const diffDays = targetOrdinal - startOrdinal;
  if (diffDays < 0) {
    return null;
  }
  const absoluteWeek = Math.floor(diffDays / 7) + 1;
  if (!usesFourWeekCycle(response)) {
    return absoluteWeek;
  }
  return ((absoluteWeek - 1) % 4) + 1;
}

/**
 * Returns lessons scheduled for a specific calendar date.
 *
 * Date matching uses local calendar date semantics from the provided `date` object.
 * Lessons with `dateLesson` are matched directly by date key.
 * Weekly schedule lessons are matched by weekday and inferred week number.
 * Exams without `dateLesson` but with a date range appear on every day within that range —
 * in practice BSUIR exams have `dateLesson` set, so this branch handles edge cases only.
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param date - Target date. Must be a `Date` object — local calendar date is used.
 * @returns Lessons for that date sorted by start time.
 *
 * @example
 * ```ts
 * const lessons = getLessonsForDate(schedule, new Date(2026, 1, 10));
 * ```
 */
export function getLessonsForDate(
  normalizedSchedule: NormalizedScheduleResponse,
  date: Date
): FlattenedScheduleItem[] {
  const targetDate = toDateOrThrow(date, "date");
  const targetDateKey = toDateKey(targetDate);
  const targetOrdinal = toDateDayOrdinal(targetDate);
  const targetWeekday = toWeekday(targetDate);
  const inferredWeekNumber = inferWeekNumberForDate(normalizedSchedule, targetDate);

  return sortLessonsByTime(
    normalizedSchedule.lessons.filter((lesson) => {
      const lessonDateKey = toLessonDateKey(lesson.dateLesson);
      if (lessonDateKey) {
        return lessonDateKey === targetDateKey;
      }

      if (lesson.source === "exams") {
        if (!lesson.startLessonDate && !lesson.endLessonDate) {
          return false;
        }
        return isWithinLessonDateRange(targetOrdinal, lesson.startLessonDate, lesson.endLessonDate);
      }

      if (lesson.day !== targetWeekday) {
        return false;
      }

      if (
        typeof inferredWeekNumber === "number" &&
        Array.isArray(lesson.weekNumber) &&
        lesson.weekNumber.length > 0 &&
        !lesson.weekNumber.includes(inferredWeekNumber)
      ) {
        return false;
      }

      return isWithinLessonDateRange(targetOrdinal, lesson.startLessonDate, lesson.endLessonDate);
    })
  );
}

/**
 * Returns lessons for the local current day.
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param now - Optional current moment override for deterministic usage.
 * @returns Lessons for today sorted by start time.
 *
 * @example
 * ```ts
 * const todayLessons = getTodayLessons(schedule, new Date());
 * ```
 */
export function getTodayLessons(
  normalizedSchedule: NormalizedScheduleResponse,
  now: Date = new Date()
): FlattenedScheduleItem[] {
  const current = toDateOrThrow(now, "now");
  return getLessonsForDate(normalizedSchedule, current);
}

/**
 * Returns lessons for the next local calendar day.
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param now - Optional current moment override for deterministic usage.
 * @returns Lessons for tomorrow sorted by start time.
 *
 * @example
 * ```ts
 * const tomorrowLessons = getTomorrowLessons(schedule, new Date());
 * ```
 */
export function getTomorrowLessons(
  normalizedSchedule: NormalizedScheduleResponse,
  now: Date = new Date()
): FlattenedScheduleItem[] {
  const current = toDateOrThrow(now, "now");
  const tomorrow = new Date(current);
  tomorrow.setDate(current.getDate() + 1);
  return getLessonsForDate(normalizedSchedule, tomorrow);
}

/**
 * Returns regular schedule lessons for a specific week number.
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param weekNumber - Positive week number to match.
 * @returns Matching regular lessons sorted by start time.
 *
 * @example
 * ```ts
 * const secondWeek = getLessonsForWeek(schedule, 2);
 * ```
 */
export function getLessonsForWeek(
  normalizedSchedule: NormalizedScheduleResponse,
  weekNumber: number
): FlattenedScheduleItem[] {
  assertPositiveInt(weekNumber, "weekNumber");
  return sortLessonsByTime(
    filterLessons(normalizedSchedule, {
      source: "schedules",
      weekNumber
    })
  );
}

/**
 * Groups lessons by weekday.
 *
 * Lessons with `day === null` (e.g., date-specific exams) are omitted from groups.
 *
 * @param lessons - Lessons to group.
 * @returns Weekday map with arrays sorted by time for each day.
 *
 * @example
 * ```ts
 * const grouped = groupLessonsByDay(response.lessons);
 * ```
 */
export function groupLessonsByDay(
  lessons: readonly FlattenedScheduleItem[]
): FlattenedLessonsByDay {
  const grouped = createEmptyLessonsByDay();
  for (const lesson of lessons) {
    if (!lesson.day) {
      continue;
    }
    grouped[lesson.day].push(lesson);
  }
  for (const weekday of WEEKDAYS) {
    grouped[weekday] = sortLessonsByTime(grouped[weekday]);
  }
  return grouped;
}

/**
 * Builds lightweight day models for schedule screens.
 *
 * Uses local calendar dates. Returns day objects with lessons,
 * "today" marker, and optional current/next lesson metadata for the current day.
 * `currentLesson` and `nextLesson` are only computed for today (`isToday === true`).
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param options - Builder options for date range and filtering.
 * @returns Day models ready for direct UI rendering.
 *
 * @example
 * ```ts
 * const days = buildScheduleDays(schedule, { days: 7, includeEmptyDays: false });
 * // Use days?.lessons for in-day progress:
 * const current = getCurrentLesson(days?.lessons ?? []);
 * ```
 */
export function buildScheduleDays(
  normalizedSchedule: NormalizedScheduleResponse,
  options: BuildScheduleDaysOptions = {}
): ScheduleDay[] {
  const now = toDateOrThrow(options.now ?? new Date(), "options.now");
  const startDate = toDateOrThrow(options.startDate ?? now, "options.startDate");
  const days = options.days ?? 7;
  assertPositiveInt(days, "options.days");

  const includeEmptyDays = options.includeEmptyDays ?? true;
  const includeCurrentAndNextLessons = options.includeCurrentAndNextLessons ?? true;
  const onInvalidTime = options.onInvalidTime as InvalidLessonTimeHook | undefined;
  const todayKey = toDateKey(now);
  const rangeStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  const scheduleDays: ScheduleDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const dayDate = new Date(rangeStart);
    dayDate.setDate(rangeStart.getDate() + index);

    const lessons = getLessonsForDate(normalizedSchedule, dayDate);
    const dateKey = toDateKey(dayDate);
    const isToday = dateKey === todayKey;
    const hasLessons = lessons.length > 0;

    if (!includeEmptyDays && !hasLessons) {
      continue;
    }

    const weekday = toWeekday(dayDate);
    scheduleDays.push({
      date: dayDate,
      dateKey,
      weekday,
      weekdayLabel: weekday ?? SUNDAY_LABEL,
      lessons,
      isToday,
      hasLessons,
      currentLesson:
        includeCurrentAndNextLessons && isToday
          ? getCurrentLesson(lessons, now, { onInvalidTime })
          : null,
      nextLesson:
        includeCurrentAndNextLessons && isToday
          ? getNextLesson(lessons, now, { onInvalidTime })
          : null
    });
  }

  return scheduleDays;
}
