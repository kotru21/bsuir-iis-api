import { BsuirValidationError } from "../client/errors";
import { assertPositiveInt } from "./guards";

/**
 * Normalizes current week payload from API to a positive integer.
 * API can return plain text (`"1\n"`) or number.
 */
export function parseCurrentWeek(payload: unknown): number {
  if (typeof payload === "number") {
    assertPositiveInt(payload, "currentWeek");
    return payload;
  }

  if (typeof payload === "string") {
    const normalized = payload.trim();
    if (normalized.length > 0) {
      const parsed = Number(normalized);
      if (Number.isInteger(parsed)) {
        assertPositiveInt(parsed, "currentWeek");
        return parsed;
      }
    }
  }

  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    if ("weekNumber" in record) {
      return parseCurrentWeek(record.weekNumber);
    }
    if ("currentWeek" in record) {
      return parseCurrentWeek(record.currentWeek);
    }
  }

  throw new BsuirValidationError("'currentWeek' response payload must be a positive integer");
}
