import { BsuirValidationError } from "../client/errors";
import type { StudyWeekOptions } from "../types/schedule";
import {
  dayOfWeekFromOrdinal,
  fromDayOrdinal,
  getZonedDateTime,
  mondayOfWeek,
  resolveTimeZone,
  toDayOrdinal
} from "../utils/timeZone";
import { toDateOrThrow } from "./scheduleDateKeys";

const STUDY_WEEK_CYCLE = 4;

/** Known study week at a given calendar day, used to count other weeks from. */
export interface StudyWeekAnchor {
  ordinal: number;
  week: number;
}

/** Resolved inputs shared by date-based helpers: time zone plus optional week anchor. */
export interface ResolvedStudyWeekOptions {
  timeZone: string;
  anchor: StudyWeekAnchor | undefined;
}

function assertStudyWeek(value: unknown, fieldName: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > STUDY_WEEK_CYCLE
  ) {
    throw new BsuirValidationError(
      `'${fieldName}' must be an integer from 1 to ${String(STUDY_WEEK_CYCLE)}`,
      fieldName,
      value
    );
  }
}

/** Calendar day (as a day ordinal) of `date` in `timeZone`. */
export function zonedDayOrdinal(date: Date, timeZone: string): number {
  return toDayOrdinal(getZonedDateTime(date, timeZone));
}

/**
 * Validates `timeZone` / `currentWeek` / `now` once per helper call.
 * `now` only matters as the reference moment for `currentWeek`.
 */
export function resolveStudyWeekOptions(
  options: StudyWeekOptions | undefined,
  fieldPrefix: string
): ResolvedStudyWeekOptions {
  const timeZone = resolveTimeZone(options?.timeZone);
  if (options?.currentWeek === undefined) {
    return { timeZone, anchor: undefined };
  }
  assertStudyWeek(options.currentWeek, `${fieldPrefix}currentWeek`);
  const now = toDateOrThrow(options.now ?? new Date(), `${fieldPrefix}now`);
  return {
    timeZone,
    anchor: { ordinal: zonedDayOrdinal(now, timeZone), week: options.currentWeek }
  };
}

function cycleWeek(baseWeek: number, weeksElapsed: number): number {
  const zeroBased = (baseWeek - 1 + weeksElapsed) % STUDY_WEEK_CYCLE;
  return ((zeroBased + STUDY_WEEK_CYCLE) % STUDY_WEEK_CYCLE) + 1;
}

/** Monday that starts study week 1 of the academic year beginning in September of `year`. */
function academicYearFirstMonday(year: number): number {
  let firstDay = toDayOrdinal({ year, month: 9, day: 1 });
  // Sunday is not a study day: when 1 September is a Sunday, classes and week 1 start on Monday.
  if (dayOfWeekFromOrdinal(firstDay) === 0) {
    firstDay += 1;
  }
  return mondayOfWeek(firstDay);
}

/**
 * BSUIR study week (1–4) of a calendar day.
 *
 * With an anchor, weeks are counted from the anchor's week (they change on Mondays).
 * Otherwise the academic calendar is used: week 1 is the Monday–Sunday week containing
 * 1 September and the 4-week cycle runs continuously through the academic year
 * (https://www.bsuir.by/en/understanding-your-timetable).
 */
export function studyWeekForDay(ordinal: number, anchor?: StudyWeekAnchor): number {
  const monday = mondayOfWeek(ordinal);
  if (anchor) {
    return cycleWeek(anchor.week, (monday - mondayOfWeek(anchor.ordinal)) / 7);
  }
  const { year } = fromDayOrdinal(ordinal);
  let firstMonday = academicYearFirstMonday(year);
  if (monday < firstMonday) {
    firstMonday = academicYearFirstMonday(year - 1);
  }
  return cycleWeek(1, (monday - firstMonday) / 7);
}

/**
 * Returns the BSUIR study week (1–4) for a date without calling the API.
 *
 * By default the week is derived from the academic calendar (week 1 contains 1 September,
 * weeks change on Mondays). Pass `currentWeek` from `client.schedule.getCurrentWeek()` to
 * count from the authoritative IIS value instead.
 *
 * @param date - Moment to evaluate; its calendar date is read in `options.timeZone`.
 * @param options - Time zone and optional `currentWeek` anchor.
 * @returns Study week number from 1 to 4.
 *
 * @example
 * ```ts
 * getStudyWeek(new Date()); // 1..4
 * const currentWeek = await client.schedule.getCurrentWeek();
 * getStudyWeek(nextMonday, { currentWeek });
 * ```
 */
export function getStudyWeek(date: Date = new Date(), options?: StudyWeekOptions): number {
  const target = toDateOrThrow(date, "date");
  const resolved = resolveStudyWeekOptions(options, "options.");
  return studyWeekForDay(zonedDayOrdinal(target, resolved.timeZone), resolved.anchor);
}
