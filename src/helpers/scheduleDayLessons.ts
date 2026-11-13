import { BsuirResponseValidationError } from "../client/errors";
import { describeValue } from "../client/responseValidators";
import type { ScheduleItem } from "../types/schedule";

/**
 * Nullish day buckets are empty; non-arrays throw a typed error (never raw TypeError).
 */
export function asDayLessonArray(
  dayItems: unknown,
  endpoint: string,
  field: string
): ScheduleItem[] {
  if (dayItems === undefined || dayItems === null) {
    return [];
  }
  if (!Array.isArray(dayItems)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: ${field} must be an array of lessons, got ${describeValue(dayItems)}`,
      endpoint
    );
  }
  return dayItems as ScheduleItem[];
}
