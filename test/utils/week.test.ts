import { describe, expect, it } from "vitest";
import { BsuirValidationError } from "../../src/client/errors";
import { parseCurrentWeek } from "../../src/utils/week";

describe("parseCurrentWeek", () => {
  it("accepts numeric and plain-text payloads", () => {
    expect(parseCurrentWeek(3)).toBe(3);
    expect(parseCurrentWeek("4")).toBe(4);
    expect(parseCurrentWeek("5\n")).toBe(5);
  });

  it("accepts known object payload shapes", () => {
    expect(parseCurrentWeek({ weekNumber: 2 })).toBe(2);
    expect(parseCurrentWeek({ currentWeek: "6" })).toBe(6);
  });

  it("throws for invalid payload", () => {
    expect(() => parseCurrentWeek("abc")).toThrow(BsuirValidationError);
    expect(() => parseCurrentWeek({})).toThrow(BsuirValidationError);
  });
});
