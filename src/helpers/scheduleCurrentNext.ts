import type { LessonWithTime } from "../types/schedule";
import { toDateOrThrow } from "./scheduleDateKeys";

/**
 * Optional callback invoked when a lesson's `startLessonTime` or `endLessonTime`
 * cannot be parsed as `HH:MM`. Use this to surface upstream data issues that the
 * default behavior (sorting such lessons to the end, ignoring them for
 * current/next lookups) would otherwise hide.
 *
 * Within a single helper call, each malformed field is reported once (sorting
 * reports during sort; {@link getCurrentLesson} / {@link getNextLesson} do not
 * re-fire after sorting). It must not throw — exceptions from a hook are caught
 * and discarded.
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
    !Number.isSafeInteger(hours) ||
    !Number.isSafeInteger(minutes) ||
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
  const sortedLessons = sortLessonsByTime(lessons, { onInvalidTime: hook });
  for (const lesson of sortedLessons) {
    // Hook already fired during sort; re-parse without reporting again.
    const start = parseLessonTime(lesson, "startLessonTime", undefined);
    const end = parseLessonTime(lesson, "endLessonTime", undefined);
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
  const sortedLessons = sortLessonsByTime(lessons, { onInvalidTime: hook });
  for (const lesson of sortedLessons) {
    // Hook already fired during sort; re-parse without reporting again.
    const start = parseLessonTime(lesson, "startLessonTime", undefined);
    if (start === null) {
      continue;
    }
    if (start > nowMinutes) {
      return lesson;
    }
  }
  return null;
}
