import { BsuirValidationError } from "../client/errors";
import { assertPositiveInt } from "./guards";

// API response should never nest deeper than 2 levels; 10 is a generous safety cap to prevent stack overflow
const MAX_PARSE_DEPTH = 10;

/**
 * Normalizes current week payload from API to a positive integer.
 * API can return plain text (`"1\n"`) or number.
 */
export function parseCurrentWeek(payload: unknown): number {
  return parseCurrentWeekInternal(payload, 0);
}

function parseCurrentWeekInternal(payload: unknown, depth: number): number {
  // Prevent stack overflow from circular/deeply nested structures
  if (depth > MAX_PARSE_DEPTH) {
    throw new BsuirValidationError("'currentWeek' response payload has excessive nesting depth");
  }

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
      return parseCurrentWeekInternal(record.weekNumber, depth + 1);
    }
    if ("currentWeek" in record) {
      return parseCurrentWeekInternal(record.currentWeek, depth + 1);
    }
  }

  throw new BsuirValidationError("'currentWeek' response payload must be a positive integer");
}
