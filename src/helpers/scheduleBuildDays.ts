import { filterLessons } from "./scheduleFilter";
import { WEEKDAYS } from "../types/common";
import type {
  BuildScheduleDaysOptions,
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleDay,
  StudyWeekOptions
} from "../types/schedule";
import { parseDdMmYyyyParts } from "../utils/date";
import { assertPositiveInt } from "../utils/guards";
import { fromDayOrdinal, mondayOfWeek, startOfZonedDay, toDayOrdinal } from "../utils/timeZone";
import {
  getCurrentLesson,
  getNextLesson,
  sortLessonsByTime,
  type InvalidLessonTimeHook
} from "./scheduleCurrentNext";
import {
  isWithinLessonDateRange,
  SUNDAY_LABEL,
  toDateKey,
  toDateOrThrow,
  toLessonDayOrdinal,
  toWeekday
} from "./scheduleDateKeys";
import {
  resolveStudyWeekOptions,
  studyWeekForDay,
  zonedDayOrdinal,
  type ResolvedStudyWeekOptions
} from "./scheduleWeek";

type WeekResolver = (ordinal: number) => number | null;

function createEmptyLessonsByDay(): FlattenedLessonsByDay {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as FlattenedLessonsByDay;
}

function usesFourWeekCycle(response: NormalizedScheduleResponse): boolean {
  // Weekly rows only; next-term rows count too because between terms they are the
  // whole timetable (`scheduleLessons` is empty then).
  return response.lessons
    .filter((lesson) => lesson.source !== "exams")
    .flatMap((lesson) => lesson.weekNumber ?? [])
    .filter((value): value is number => Number.isSafeInteger(value) && value > 0)
    .every((value) => value <= 4);
}

/**
 * Picks how a calendar day maps to a `weekNumber`: the BSUIR 4-week study cycle, or —
 * for schedules numbering weeks beyond 4 — absolute weeks counted from `startDate`.
 */
function createWeekResolver(
  response: NormalizedScheduleResponse,
  resolved: ResolvedStudyWeekOptions
): WeekResolver {
  if (usesFourWeekCycle(response)) {
    return (ordinal) => studyWeekForDay(ordinal, resolved.anchor);
  }
  const startDateParts = parseDdMmYyyyParts(response.startDate);
  if (!startDateParts) {
    return () => null;
  }
  const startMonday = mondayOfWeek(toDayOrdinal(startDateParts));
  return (ordinal) => {
    const daysSinceStart = mondayOfWeek(ordinal) - startMonday;
    return daysSinceStart < 0 ? null : daysSinceStart / 7 + 1;
  };
}

function lessonsForDay(
  normalizedSchedule: NormalizedScheduleResponse,
  ordinal: number,
  weekNumber: number | null
): FlattenedScheduleItem[] {
  const weekday = toWeekday(ordinal);
  return sortLessonsByTime(
    normalizedSchedule.lessons.filter((lesson) => {
      const lessonOrdinal = toLessonDayOrdinal(lesson.dateLesson);
      if (lessonOrdinal !== null) {
        return lessonOrdinal === ordinal;
      }

      if (lesson.source === "exams") {
        if (!lesson.startLessonDate && !lesson.endLessonDate) {
          return false;
        }
        return isWithinLessonDateRange(ordinal, lesson.startLessonDate, lesson.endLessonDate);
      }

      if (lesson.day !== weekday) {
        return false;
      }

      if (
        weekNumber !== null &&
        Array.isArray(lesson.weekNumber) &&
        lesson.weekNumber.length > 0 &&
        !lesson.weekNumber.includes(weekNumber)
      ) {
        return false;
      }

      return isWithinLessonDateRange(ordinal, lesson.startLessonDate, lesson.endLessonDate);
    })
  );
}

/**
 * Returns lessons scheduled for a specific calendar date.
 *
 * The calendar date of `date` is read in `options.timeZone` (Minsk by default).
 * Lessons with `dateLesson` are matched directly by date.
 * Weekly schedule lessons are matched by weekday and study week — see
 * {@link StudyWeekOptions.currentWeek} for how the week is determined.
 * Exams without `dateLesson` but with a date range appear on every day within that range —
 * in practice BSUIR exams have `dateLesson` set, so this branch handles edge cases only.
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param date - Target date. Must be a `Date` object.
 * @param options - Time zone and optional `currentWeek` anchor.
 * @returns Lessons for that date sorted by start time.
 *
 * @example
 * ```ts
 * const lessons = getLessonsForDate(schedule, new Date(2026, 1, 10));
 * const currentWeek = await client.schedule.getCurrentWeek();
 * const exact = getLessonsForDate(schedule, new Date(2026, 1, 10), { currentWeek });
 * ```
 */
export function getLessonsForDate(
  normalizedSchedule: NormalizedScheduleResponse,
  date: Date,
  options?: StudyWeekOptions
): FlattenedScheduleItem[] {
  const targetDate = toDateOrThrow(date, "date");
  const resolved = resolveStudyWeekOptions(options, "options.");
  const ordinal = zonedDayOrdinal(targetDate, resolved.timeZone);
  const weekNumber = createWeekResolver(normalizedSchedule, resolved)(ordinal);
  return lessonsForDay(normalizedSchedule, ordinal, weekNumber);
}

/**
 * Returns lessons for the current day (calendar date of `now` in `options.timeZone`).
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param now - Optional current moment override for deterministic usage.
 * @param options - Time zone and optional `currentWeek` (valid at `now`).
 * @returns Lessons for today sorted by start time.
 *
 * @example
 * ```ts
 * const todayLessons = getTodayLessons(schedule, new Date());
 * ```
 */
export function getTodayLessons(
  normalizedSchedule: NormalizedScheduleResponse,
  now: Date = new Date(),
  options?: Omit<StudyWeekOptions, "now">
): FlattenedScheduleItem[] {
  const current = toDateOrThrow(now, "now");
  return getLessonsForDate(normalizedSchedule, current, { ...options, now: current });
}

/**
 * Returns lessons for the calendar day after `now` (in `options.timeZone`).
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param now - Optional current moment override for deterministic usage.
 * @param options - Time zone and optional `currentWeek` (valid at `now`).
 * @returns Lessons for tomorrow sorted by start time.
 *
 * @example
 * ```ts
 * const tomorrowLessons = getTomorrowLessons(schedule, new Date());
 * ```
 */
export function getTomorrowLessons(
  normalizedSchedule: NormalizedScheduleResponse,
  now: Date = new Date(),
  options?: Omit<StudyWeekOptions, "now">
): FlattenedScheduleItem[] {
  const current = toDateOrThrow(now, "now");
  const resolved = resolveStudyWeekOptions({ ...options, now: current }, "options.");
  const tomorrow = zonedDayOrdinal(current, resolved.timeZone) + 1;
  const weekNumber = createWeekResolver(normalizedSchedule, resolved)(tomorrow);
  return lessonsForDay(normalizedSchedule, tomorrow, weekNumber);
}

/**
 * Returns weekly (non-exam) lessons for a specific week number.
 *
 * Includes next-term rows when the normalized payload contains them (between terms,
 * or with `includeNextSchedules: true`); check `source` to tell them apart.
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param weekNumber - Positive week number to match.
 * @returns Matching weekly lessons sorted by start time.
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
    filterLessons(normalizedSchedule, { weekNumber }).filter((lesson) => lesson.source !== "exams")
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
 * Calendar days and "today" are computed in `options.timeZone` (Minsk by default).
 * Returns day objects with lessons, the study week, a "today" marker, and optional
 * current/next lesson metadata. `currentLesson` and `nextLesson` are only computed
 * for today (`isToday === true`).
 *
 * @param normalizedSchedule - Normalized schedule payload from {@link normalizeSchedule}.
 * @param options - Builder options for date range, time zone, week anchor and filtering.
 * @returns Day models ready for direct UI rendering.
 *
 * @example
 * ```ts
 * const currentWeek = await client.schedule.getCurrentWeek();
 * const days = buildScheduleDays(schedule, { days: 7, includeEmptyDays: false, currentWeek });
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

  const resolved = resolveStudyWeekOptions({ ...options, now }, "options.");
  const weekFor = createWeekResolver(normalizedSchedule, resolved);
  const includeEmptyDays = options.includeEmptyDays ?? true;
  const includeCurrentAndNextLessons = options.includeCurrentAndNextLessons ?? true;
  const onInvalidTime = options.onInvalidTime as InvalidLessonTimeHook | undefined;
  const todayOrdinal = zonedDayOrdinal(now, resolved.timeZone);
  const rangeStart = zonedDayOrdinal(startDate, resolved.timeZone);

  const scheduleDays: ScheduleDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const ordinal = rangeStart + index;
    const weekNumber = weekFor(ordinal);
    const lessons = lessonsForDay(normalizedSchedule, ordinal, weekNumber);
    const isToday = ordinal === todayOrdinal;
    const hasLessons = lessons.length > 0;

    if (!includeEmptyDays && !hasLessons) {
      continue;
    }

    const parts = fromDayOrdinal(ordinal);
    const weekday = toWeekday(ordinal);
    const lessonTimeOptions = { onInvalidTime, timeZone: resolved.timeZone };
    scheduleDays.push({
      date: startOfZonedDay(parts, resolved.timeZone),
      dateKey: toDateKey(parts),
      weekday,
      weekdayLabel: weekday ?? SUNDAY_LABEL,
      weekNumber,
      lessons,
      isToday,
      hasLessons,
      currentLesson:
        includeCurrentAndNextLessons && isToday
          ? getCurrentLesson(lessons, now, lessonTimeOptions)
          : null,
      nextLesson:
        includeCurrentAndNextLessons && isToday
          ? getNextLesson(lessons, now, lessonTimeOptions)
          : null
    });
  }

  return scheduleDays;
}
