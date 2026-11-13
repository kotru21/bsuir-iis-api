import { BsuirResponseValidationError } from "../client/errors";
import { describeValue } from "../client/responseValidators";

// API response should never nest deeper than 2 levels; 10 is a generous safety cap to prevent stack overflow
const MAX_PARSE_DEPTH = 10;

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Normalizes the `current-week` payload from IIS to a positive integer.
 * IIS can return plain text (`"1\n"`), a number, or an object wrapping either.
 *
 * Anything else (an HTML maintenance page, an empty body, `0`…) is a bad **response**,
 * not bad caller input, so it is reported as {@link BsuirResponseValidationError}
 * carrying `endpoint`.
 */
export function parseCurrentWeek(payload: unknown, endpoint: string): number {
  const fail = (expectation: string): never => {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: ${expectation}, got ${describeValue(payload)}`,
      endpoint
    );
  };

  let current: unknown = payload;
  for (let depth = 0; depth <= MAX_PARSE_DEPTH; depth += 1) {
    if (typeof current === "number") {
      return isPositiveSafeInteger(current) ? current : fail("expected a positive integer week");
    }

    if (typeof current === "string") {
      const normalized = current.trim();
      const parsed = normalized.length === 0 ? Number.NaN : Number(normalized);
      return isPositiveSafeInteger(parsed) ? parsed : fail("expected a positive integer week");
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

    return fail("expected a positive integer week");
  }

  return fail("week value is nested too deeply");
}
