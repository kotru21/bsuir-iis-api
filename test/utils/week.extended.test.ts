import { describe, expect, it } from "vitest";
import { BsuirResponseValidationError } from "../../src/client/errors";
import { parseCurrentWeek } from "../../src/utils/week";

const EP = "/schedule/current-week";

describe("parseCurrentWeek — edge cases", () => {
  it("parses plain number", () => {
    expect(parseCurrentWeek(3, EP)).toBe(3);
  });

  it("parses string with newline (plain-text API format)", () => {
    expect(parseCurrentWeek("2\n", EP)).toBe(2);
  });

  it("parses weekNumber from object", () => {
    expect(parseCurrentWeek({ weekNumber: 4 }, EP)).toBe(4);
  });

  it("parses currentWeek from object", () => {
    expect(parseCurrentWeek({ currentWeek: "1" }, EP)).toBe(1);
  });

  it("throws for empty string (line 28)", () => {
    expect(() => parseCurrentWeek(" ".repeat(3), EP)).toThrow(BsuirResponseValidationError);
  });

  it("throws for non-positive integer string", () => {
    expect(() => parseCurrentWeek("0", EP)).toThrow();
    expect(() => parseCurrentWeek("-1", EP)).toThrow();
  });

  it("throws for unknown payload type", () => {
    expect(() => parseCurrentWeek(null, EP)).toThrow(BsuirResponseValidationError);
    expect(() => parseCurrentWeek([], EP)).toThrow(BsuirResponseValidationError);
  });

  it("throws for excessive nesting depth (line 17)", () => {
    // Build object nested 11 levels deep via weekNumber chain
    let deep: unknown = { weekNumber: 1 }; // level 1 valid
    for (let i = 0; i < 11; i++) {
      deep = { weekNumber: deep };
    }
    expect(() => parseCurrentWeek(deep, EP)).toThrow(BsuirResponseValidationError);
  });

  it("throws for object without weekNumber or currentWeek keys", () => {
    expect(() => parseCurrentWeek({ foo: 1 }, EP)).toThrow(BsuirResponseValidationError);
  });
});
