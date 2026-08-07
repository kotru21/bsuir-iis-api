import { BsuirValidationError } from "../client/errors";
import { assertPositiveInt } from "./guards";

// API response should never nest deeper than 2 levels; 10 is a generous safety cap to prevent stack overflow
const MAX_PARSE_DEPTH = 10;

/**
 * Normalizes current week payload from API to a positive integer.
 * API can return plain text (`"1\n"`) or number.
 */
export function parseCurrentWeek(payload: unknown): number {
  return parseCurrentWeekInternal(payload);
}

function parseCurrentWeekInternal(payload: unknown): number {
  let current: unknown = payload;

  for (let depth = 0; depth <= MAX_PARSE_DEPTH; depth += 1) {
    if (typeof current === "number") {
      assertPositiveInt(current, "currentWeek");
      return current;
    }

    if (typeof current === "string") {
      const normalized = current.trim();
      if (normalized.length === 0) {
        throw new BsuirValidationError(
          "'currentWeek' response payload is an empty string",
          "currentWeek",
          payload
        );
      }
      const parsed = Number(normalized);
      // assertPositiveInt validates both isSafeInteger and > 0 — no need to pre-check
      assertPositiveInt(parsed, "currentWeek");
      return parsed;
    }

    if (typeof current === "object" && current !== null) {
      const record = current as Record<string, unknown>;
      if ("weekNumber" in record) {
        current = record.weekNumber;
        continue;
      }
      if ("currentWeek" in record) {
        current = record.currentWeek;
        continue;
      }
    }

    throw new BsuirValidationError(
      "'currentWeek' response payload must be a positive integer",
      "currentWeek",
      payload
    );
  }

  throw new BsuirValidationError(
    "'currentWeek' response payload has excessive nesting depth",
    "currentWeek",
    payload
  );
}
