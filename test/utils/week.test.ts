import { describe, expect, it } from "vitest";
import { BsuirResponseValidationError, BsuirValidationError } from "../../src/client/errors";
import { parseCurrentWeek } from "../../src/utils/week";

const EP = "/schedule/current-week";

describe("parseCurrentWeek", () => {
  it("accepts numeric and plain-text payloads", () => {
    expect(parseCurrentWeek(3, EP)).toBe(3);
    expect(parseCurrentWeek("4", EP)).toBe(4);
    expect(parseCurrentWeek("5\n", EP)).toBe(5);
  });

  it("accepts known object payload shapes", () => {
    expect(parseCurrentWeek({ weekNumber: 2 }, EP)).toBe(2);
    expect(parseCurrentWeek({ currentWeek: "6" }, EP)).toBe(6);
  });

  it("throws for invalid payload", () => {
    expect(() => parseCurrentWeek("abc", EP)).toThrow(BsuirResponseValidationError);
    expect(() => parseCurrentWeek({}, EP)).toThrow(BsuirResponseValidationError);
  });

  // Regression: an HTML maintenance page used to surface as BsuirValidationError
  // ("'currentWeek' must be a positive integer") — a caller-input error without endpoint.
  it("reports a bad IIS response with the endpoint, not as caller input error", () => {
    const error: unknown = (() => {
      try {
        return parseCurrentWeek("<html>maintenance</html>", EP);
      } catch (error_: unknown) {
        return error_;
      }
    })();
    expect(error).toBeInstanceOf(BsuirResponseValidationError);
    expect(error).not.toBeInstanceOf(BsuirValidationError);
    expect((error as BsuirResponseValidationError).endpoint).toBe(EP);
    expect((error as Error).message).toMatch(
      /current-week: expected a positive integer week, got string/
    );
  });
});
