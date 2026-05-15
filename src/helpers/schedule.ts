import { filterLessons } from "../modules/scheduleFilter";
import type { Weekday } from "../types/common";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleDayMap,
} from "../types/schedule";
import { parseDdMmYyyy } from "../utils/date";

/**
 * Returns today's lessons from a normalized schedule, based on the current date and week number.
 *
 * If the `currentWeek` parameter is omitted the helper will try to infer a reasonable week
 * number by looking at `schedule.currentWeek` (returned by the API).
 *
 * @public
 */
export function getTodayLessons(
  schedule: NormalizedScheduleResponse,
  currentWeek?: number,
): FlattenedScheduleItem[] {
  const today = new Date();
  const dayIndex = today.getDay(); // 0 = Sunday, 1 = Monday, …

  const DAYS: Weekday[] = [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ];

  const weekday = DAYS[dayIndex];
  if (!weekday) return [];

  const week = currentWeek ?? schedule.currentWeek ?? undefined;

  return filterLessons(schedule, {
    weekday,
    ...(week !== undefined ? { weekNumber: week } : {}),
  });
}

/** @public */
export type ScheduleDayEntry = {
  /** Human-readable weekday name (e.g. "Понедельник") */
  day: Weekday;
  /** ISO date string (YYYY-MM-DD), present only when `dateLesson` was set on the lessons */
  date?: string;
  /** All lessons for this day */
  lessons: FlattenedScheduleItem[];
};

/**
 * Groups a flat lesson list into per-day buckets sorted by start time.
 *
 * Each entry exposes `day` (weekday name), an optional `date` (ISO string when all
 * lessons share the same `dateLesson`), and the `lessons` array for that day.
 *
 * @public
 */
export function buildScheduleDays(
  lessons: FlattenedScheduleItem[],
): ScheduleDayEntry[] {
  const map = groupLessonsByDay(lessons);
  const order: Weekday[] = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
  ];

  return order
    .filter((day) => map[day] && map[day].length > 0)
    .map((day) => {
      const dayLessons = map[day];
      // If every lesson carries the same non-null dateLesson, surface it as `date`.
      const dates = new Set(dayLessons.map((l) => l.dateLesson));
      const commonDate =
        dates.size === 1 && !dates.has(null)
          ? (dates.values().next().value as string)
          : undefined;
      return {
        day,
        ...(commonDate !== undefined ? { date: isoDate(commonDate) } : {}),
        lessons: dayLessons,
      };
    });
}

/** Converts a DD.MM.YYYY date string to ISO YYYY-MM-DD. */
function isoDate(ddMmYyyy: string): string {
  const d = parseDdMmYyyy(ddMmYyyy);
  return d ? d.toISOString().slice(0, 10) : ddMmYyyy;
}

/**
 * Groups an array of flattened lessons into a {@link ScheduleDayMap} keyed by weekday.
 *
 * Within each day the lessons are sorted by start time ascending,
 * then by end time ascending for ties, and finally by original array index
 * so the order is deterministic even for simultaneous lessons.
 *
 * @public
 */
export function groupLessonsByDay(
  lessons: FlattenedScheduleItem[],
): ScheduleDayMap {
  const result: ScheduleDayMap = {};

  for (const lesson of lessons) {
    const day = lesson.day;
    if (!result[day]) {
      result[day] = [];
    }
    result[day].push(lesson);
  }

  for (const day of Object.keys(result) as Weekday[]) {
    result[day] = sortLessonsByTime(result[day]);
  }

  return result;
}

/**
 * Returns a new array of lessons sorted by start time ascending, then by end time,
 * then by original index for a stable, deterministic order.
 *
 * @public
 */
export function sortLessonsByTime(
  lessons: FlattenedScheduleItem[],
): FlattenedScheduleItem[] {
  return lessons
    .map((lesson, index) => ({
      lesson,
      index,
      start: parseTimeToMinutes(lesson.startLessonTime),
      end: parseTimeToMinutes(lesson.endLessonTime),
    }))
    .toSorted((a, b) => {
      const startDiff =
        (a.start ?? Number.POSITIVE_INFINITY) -
        (b.start ?? Number.POSITIVE_INFINITY);
      if (startDiff !== 0) {
        return startDiff;
      }
      const endDiff =
        (a.end ?? Number.POSITIVE_INFINITY) -
        (b.end ?? Number.POSITIVE_INFINITY);
      if (endDiff !== 0) {
        return endDiff;
      }
      return a.index - b.index;
    })
    .map((item) => item.lesson);
}

/**
 * Returns lessons that fall within the requested academic week number.
 *
 * Lessons without an explicit `weekNumber` list (i.e. `weekNumber === null`) are
 * treated as repeating every week and are always included.
 *
 * @public
 */
export function getLessonsForWeek(
  schedule: NormalizedScheduleResponse,
  week: number,
): FlattenedScheduleItem[] {
  return schedule.lessons.filter(
    (l) => l.weekNumber === null || l.weekNumber.includes(week),
  );
}
