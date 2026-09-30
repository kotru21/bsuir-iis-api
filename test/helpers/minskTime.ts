/**
 * Instant for a Minsk wall-clock time (UTC+3, no DST since 2011), independent of the
 * test runner's TZ. Month is 0-based like the `Date` constructor.
 */
export function minskTime(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour - 3, minute));
}
