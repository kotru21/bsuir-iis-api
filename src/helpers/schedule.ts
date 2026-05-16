import { filterLessons } from "../modules/scheduleFilter";
import { WEEKDAYS, type Weekday } from "../types/common";
import type {
  BuildScheduleDaysOptions,
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  LessonWithTime,
  NormalizedScheduleResponse,
  ScheduleDay
} from "../types/schedule";
import { assertPositiveInt } from "../utils/guards";

const SUNDAY_LABEL = "Воскресенье";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DdMmYyyyParts {
  day: number;
  month: number;
  year: number;
}

function createEmptyLessonsByDay(): FlattenedLessonsByDay {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as FlattenedLessonsByDay;
}

function parseDdMmYyyyParts(value: string | null): DdMmYyyyParts | null {
  if (!value) {
    return null;
  }
  const matched = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!matched) {
    return null;
  }
  const [, dayPart, monthPart, yearPart] = matched;
  const day = Number(dayPart);
  const month = Number(monthPart);
  const year = Number(yearPart);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

function toDayOrdinal(parts: DdMmYyyyParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

function toDateDayOrdinal(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

function toDateKey(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLessonDateKey(value: string | null): string | null {
  const parts = parseDdMmYyyyParts(value);
  if (!parts) {
    return null;
  }
  return `${String(parts.year)}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function toLessonDayOrdinal(value: string | null): number | null {
  const parts = parseDdMmYyyyParts(value);
  return parts ? toDayOrdinal(parts) : null;
}

function toWeekday(date: Date): Weekday | null {
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
function toDateOrThrow(value: Date, fieldName: string): Date {
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
 * Optional callback invoked when a lesson's `startLessonTime` or `endLessonTime`
 * cannot be parsed as `HH:MM`. Use this to surface upstream data issues that the
 * default behavior (sorting such lessons to the end, ignoring them for
 * current/next lookups) would otherwise hide.
 *
 * The callback is fired at most once per malformed value per call site. It must
 * not throw — exceptions from a hook are caught and discarded.
 *
 * @example
 * ```ts
 * const sorted = sortLessonsByTime(lessons, {
 *   onInvalidTime: (info) => logger.warn("malformed lesson time", info),
 * });
 * ```
 */
export type InvalidLessonTimeHook = (info: {
  field: "startLessonTime" | "endLessonTime";
  value: string;
  lesson: LessonWithTime;
}) => void;

function parseTimeToMinutes(value: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!matched) {
    return null;
  }
  const [, hourPart, minutePart] = matched;
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function reportInvalidTime(
  lesson: LessonWithTime,
  field: "startLessonTime" | "endLessonTime",
  value: string,
  hook: InvalidLessonTimeHook | undefined
): void {
  if (!hook) {
    return;
  }
  try {
    hook({ field, value, lesson });
  } catch {
    // Hook failures must not break schedule sorting/lookup.
  }
}

function parseLessonTime(
  lesson: LessonWithTime,
  field: "startLessonTime" | "endLessonTime",
  hook: InvalidLessonTimeHook | undefined
): number | null {
  const value = lesson[field];
  const parsed = parseTimeToMinutes(value);
  if (parsed === null && value.length > 0) {
    reportInvalidTime(lesson, field, value, hook);
  }
  return parsed;
}

function isWithinLessonDateRange(
  targetOrdinal: number,
  startDate: string | null,
  endDate: string | null
): boolean {
  const startOrdinal = toLessonDayOrdinal(startDate);
  const endOrdinal = toLessonDayOrdinal(endDate);
  if (startOrdinal !== null && targetOrdinal < startOrdinal) {
    return false;
  }
  if (endOrdinal !== null && targetOrdinal > endOrdinal) {
    return false;
  }
  return true;
}

function usesFourWeekCycle(response: NormalizedScheduleResponse): boolean {
  const values = response.scheduleLessons
    .flatMap((lesson) => lesson.weekNumber ?? [])
    .filter((value): value is number => Number.isInteger(value) && value > 0);
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
 * Returns a new lessons array sorted by start time, then by end time.
 * Invalid or missing time strings are kept at the end in original order.
 *
 * @param lessons - Lessons to sort.
 * @returns New sorted lessons array.
 *
 * @example
 * ```ts
 * const sorted = sortLessonsByTime(response.lessons);
 * ```
 */
export function sortLessonsByTime<T extends LessonWithTime>(
  lessons: readonly T[],
  options?: { onInvalidTime?: InvalidLessonTimeHook | undefined }
): T[] {
  const hook = options?.onInvalidTime;
  return lessons
    .map((lesson, index) => ({
      lesson,
      index,
      start: parseLessonTime(lesson, "startLessonTime", hook),
      end: parseLessonTime(lesson, "endLessonTime", hook)
    }))
    .toSorted((a, b) => {
      const startDiff =
        (a.start ?? Number.POSITIVE_INFINITY) - (b.start ?? Number.POSITIVE_INFINITY);
      if (startDiff !== 0) {
        return startDiff;
      }
      const endDiff = (a.end ?? Number.POSITIVE_INFINITY) - (b.end ?? Number.POSITIVE_INFINITY);
      if (endDiff !== 0) {
        return endDiff;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.lesson);
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
 * Returns the lesson active at the specified moment.
 *
 * Time comparison uses local hours/minutes: `startLessonTime <= now < endLessonTime`.
 * A lesson is not considered active exactly at its end time.
 *
 * @param lessons - Lessons for one day (or any same-day set).
 * @param now - Optional current moment override.
 * @returns Current lesson or `null` when none is active.
 *
 * @example
 * ```ts
 * const current = getCurrentLesson(todayLessons, new Date());
 * ```
 */
export function getCurrentLesson<T extends LessonWithTime>(
  lessons: readonly T[],
  now: Date = new Date(),
  options?: { onInvalidTime?: InvalidLessonTimeHook | undefined }
): T | null {
  const current = toDateOrThrow(now, "now");
  const nowMinutes = current.getHours() * 60 + current.getMinutes();
  const hook = options?.onInvalidTime;
  for (const lesson of sortLessonsByTime(lessons, { onInvalidTime: hook })) {
    const start = parseLessonTime(lesson, "startLessonTime", hook);
    const end = parseLessonTime(lesson, "endLessonTime", hook);
    if (start === null || end === null || end <= start) {
      continue;
    }
    if (nowMinutes >= start && nowMinutes < end) {
      return lesson;
    }
  }
  return null;
}

/**
 * Returns the nearest upcoming lesson after the specified moment.
 *
 * A lesson starting exactly at `now` is not returned (use {@link getCurrentLesson} instead).
 * A lesson that just ended at `now` is also not returned as current — the next one is.
 *
 * @param lessons - Lessons for one day (or any same-day set).
 * @param now - Optional current moment override.
 * @returns Next lesson or `null` when there is no upcoming lesson.
 *
 * @example
 * ```ts
 * const next = getNextLesson(todayLessons, new Date());
 * ```
 */
export function getNextLesson<T extends LessonWithTime>(
  lessons: readonly T[],
  now: Date = new Date(),
  options?: { onInvalidTime?: InvalidLessonTimeHook | undefined }
): T | null {
  const current = toDateOrThrow(now, "now");
  const nowMinutes = current.getHours() * 60 + current.getMinutes();
  const hook = options?.onInvalidTime;
  for (const lesson of sortLessonsByTime(lessons, { onInvalidTime: hook })) {
    const start = parseLessonTime(lesson, "startLessonTime", hook);
    if (start === null) {
      continue;
    }
    if (start > nowMinutes) {
      return lesson;
    }
  }
  return null;
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
