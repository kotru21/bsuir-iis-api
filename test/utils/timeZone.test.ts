import { describe, expect, it } from "vitest";
import {
  BSUIR_TIME_ZONE,
  dayOfWeekFromOrdinal,
  fromDayOrdinal,
  getZonedDateTime,
  mondayOfWeek,
  resolveTimeZone,
  startOfZonedDay,
  toDayOrdinal
} from "../../src/utils/timeZone";
import { BsuirValidationError } from "../../src/client/errors";

describe("timeZone utils", () => {
  it("defaults to Europe/Minsk and validates names", () => {
    expect(resolveTimeZone(undefined)).toBe(BSUIR_TIME_ZONE);
    expect(resolveTimeZone("UTC")).toBe("UTC");
    expect(() => resolveTimeZone("Nope/Nowhere")).toThrow(BsuirValidationError);
  });

  it("reads wall-clock parts in a zone, with midnight as hour 0", () => {
    expect(getZonedDateTime(new Date("2026-09-27T21:00:00Z"), "Europe/Minsk")).toEqual({
      year: 2026,
      month: 9,
      day: 28,
      hour: 0,
      minute: 0,
      second: 0
    });
  });

  it("round-trips day ordinals and weekdays", () => {
    const ordinal = toDayOrdinal({ year: 2026, month: 9, day: 1 });
    expect(fromDayOrdinal(ordinal)).toEqual({ year: 2026, month: 9, day: 1 });
    expect(dayOfWeekFromOrdinal(ordinal)).toBe(2); // Tuesday
    expect(fromDayOrdinal(mondayOfWeek(ordinal))).toEqual({ year: 2026, month: 8, day: 31 });
    expect(dayOfWeekFromOrdinal(toDayOrdinal({ year: 1969, month: 12, day: 28 }))).toBe(0);
  });

  it("finds the start of a calendar day, including DST transition days", () => {
    const day = { year: 2026, month: 3, day: 29 };
    expect(startOfZonedDay(day, "Europe/Minsk").toISOString()).toBe("2026-03-28T21:00:00.000Z");
    // Europe/Berlin switches to CEST at 02:00 that day; midnight is still CET (UTC+1).
    expect(startOfZonedDay(day, "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // New York falls back at 02:00 on 1 Nov 2026; midnight is still EDT (UTC-4).
    expect(
      startOfZonedDay({ year: 2026, month: 11, day: 1 }, "America/New_York").toISOString()
    ).toBe("2026-11-01T04:00:00.000Z");
  });
});
