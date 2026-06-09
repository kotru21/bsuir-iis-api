import { describe, expect, it } from "vitest";
import { BsuirValidationError } from "../../src/client/errors";
import { parseCurrentWeek } from "../../src/utils/week";

describe("parseCurrentWeek — edge cases", () => {
  it("parses plain number", () => {
    expect(parseCurrentWeek(3)).toBe(3);
  });

  it("parses string with newline (plain-text API format)", () => {
    expect(parseCurrentWeek("2\n")).toBe(2);
  });

  it("parses weekNumber from object", () => {
    expect(parseCurrentWeek({ weekNumber: 4 })).toBe(4);
  });

  it("parses currentWeek from object", () => {
    expect(parseCurrentWeek({ currentWeek: "1" })).toBe(1);
  });

  it("throws for empty string (line 28)", () => {
    expect(() => parseCurrentWeek(" ".repeat(3))).toThrow(BsuirValidationError);
  });

  it("throws for non-positive integer string", () => {
    expect(() => parseCurrentWeek("0")).toThrow();
    expect(() => parseCurrentWeek("-1")).toThrow();
  });

  it("throws for unknown payload type", () => {
    expect(() => parseCurrentWeek(null)).toThrow(BsuirValidationError);
    expect(() => parseCurrentWeek([])).toThrow(BsuirValidationError);
  });

  it("throws for excessive nesting depth (line 17)", () => {
    // Build object nested 11 levels deep via weekNumber chain
    let deep: unknown = { weekNumber: 1 }; // level 1 valid
    for (let i = 0; i < 11; i++) {
      deep = { weekNumber: deep };
    }
    expect(() => parseCurrentWeek(deep)).toThrow(BsuirValidationError);
  });

  it("throws for object without weekNumber or currentWeek keys", () => {
    expect(() => parseCurrentWeek({ foo: 1 })).toThrow(BsuirValidationError);
  });
});
