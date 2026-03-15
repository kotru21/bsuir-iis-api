import { BsuirValidationError } from "../client/errors";
import { assertPositiveInt } from "./guards";

const CYCLE_LENGTH = 4;

/**
 * Converts semester week number to BSUIR cycle week (1..4).
 * For default configuration weeks 1-2 => 1, 3-4 => 2, 5-6 => 3, 7-8 => 4.
 */
export function toCycleWeek(semesterWeek: number, weeksPerCycle = 2): number {
  assertPositiveInt(semesterWeek, "semesterWeek");
  assertPositiveInt(weeksPerCycle, "weeksPerCycle");

  return (Math.floor((semesterWeek - 1) / weeksPerCycle) % CYCLE_LENGTH) + 1;
}

/**
 * Normalizes semester week payload from API to a positive integer.
 * API can return plain text (`"1\n"`) or number.
 */
export function parseSemesterWeek(payload: unknown): number {
  if (typeof payload === "number") {
    assertPositiveInt(payload, "semesterWeek");
    return payload;
  }

  if (typeof payload === "string") {
    const normalized = payload.trim();
    if (normalized.length > 0) {
      const parsed = Number(normalized);
      if (Number.isInteger(parsed)) {
        assertPositiveInt(parsed, "semesterWeek");
        return parsed;
      }
    }
  }

  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    if ("weekNumber" in record) {
      return parseSemesterWeek(record.weekNumber);
    }
    if ("currentWeek" in record) {
      return parseSemesterWeek(record.currentWeek);
    }
  }

  throw new BsuirValidationError("'semesterWeek' response payload must be a positive integer");
}
