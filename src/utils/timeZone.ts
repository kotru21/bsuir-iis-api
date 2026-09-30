import { BsuirValidationError } from "../client/errors";
import type { DdMmYyyyParts } from "./date";

/** IANA time zone of BSUIR timetables (lesson times are Minsk wall-clock times). */
export const BSUIR_TIME_ZONE = "Europe/Minsk";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Wall-clock calendar date and time of an instant in a specific time zone. */
export interface ZonedDateTime extends DdMmYyyyParts {
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
  } catch {
    throw new BsuirValidationError(
      `'timeZone' must be a valid IANA time zone name, got '${timeZone}'`,
      "timeZone",
      timeZone
    );
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * Validates an optional `timeZone` option and falls back to {@link BSUIR_TIME_ZONE}.
 * Invalid names throw `BsuirValidationError` up front instead of on first use.
 */
export function resolveTimeZone(timeZone: string | undefined): string {
  if (timeZone === undefined) {
    return BSUIR_TIME_ZONE;
  }
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) {
    throw new BsuirValidationError(
      "'timeZone' must be a non-empty IANA time zone name",
      "timeZone",
      timeZone
    );
  }
  getFormatter(timeZone);
  return timeZone;
}

/** Wall-clock parts of `date` in `timeZone` (seconds precision). */
export function getZonedDateTime(date: Date, timeZone: string): ZonedDateTime {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year ?? Number.NaN,
    month: parts.month ?? Number.NaN,
    day: parts.day ?? Number.NaN,
    // Some engines still emit "24" at midnight even with hourCycle "h23".
    hour: (parts.hour ?? Number.NaN) % 24,
    minute: parts.minute ?? Number.NaN,
    second: parts.second ?? Number.NaN
  };
}

/** Days since 1970-01-01 for a calendar date (time-zone free). */
export function toDayOrdinal(parts: DdMmYyyyParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

/** Calendar date for a day ordinal produced by {@link toDayOrdinal}. */
export function fromDayOrdinal(ordinal: number): DdMmYyyyParts {
  const date = new Date(ordinal * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

/** Day of week for a day ordinal: `0` = Sunday … `6` = Saturday. */
export function dayOfWeekFromOrdinal(ordinal: number): number {
  // 1970-01-01 (ordinal 0) was a Thursday.
  return (((ordinal + 4) % 7) + 7) % 7;
}

/** Ordinal of the Monday that starts the (Monday–Sunday) week containing `ordinal`. */
export function mondayOfWeek(ordinal: number): number {
  return ordinal - ((dayOfWeekFromOrdinal(ordinal) + 6) % 7);
}

/**
 * The instant at which calendar day `parts` starts (00:00) in `timeZone`.
 * Best effort for zones whose DST switch happens exactly at midnight.
 */
export function startOfZonedDay(parts: DdMmYyyyParts, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let guess = target;
  // Two correction passes: the second one settles offsets that differ across a DST switch.
  for (let pass = 0; pass < 2; pass += 1) {
    const wall = getZonedDateTime(new Date(guess), timeZone);
    const wallAsUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second
    );
    guess += target - wallAsUtc;
  }
  return new Date(guess);
}
