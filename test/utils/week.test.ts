import { describe, expect, it } from "vitest";
import { BsuirValidationError } from "../../src/client/errors";
import { parseSemesterWeek, toCycleWeek } from "../../src/utils/week";

describe("toCycleWeek", () => {
  it("converts semester week to cycle week with default weeksPerCycle", () => {
    expect(toCycleWeek(1)).toBe(1);
    expect(toCycleWeek(2)).toBe(1);
    expect(toCycleWeek(3)).toBe(2);
    expect(toCycleWeek(4)).toBe(2);
    expect(toCycleWeek(8)).toBe(4);
    expect(toCycleWeek(9)).toBe(1);
  });

  it("supports custom weeksPerCycle", () => {
    expect(toCycleWeek(1, 1)).toBe(1);
    expect(toCycleWeek(2, 1)).toBe(2);
    expect(toCycleWeek(5, 1)).toBe(1);
  });

  it("validates input values", () => {
    expect(() => toCycleWeek(0)).toThrow(BsuirValidationError);
    expect(() => toCycleWeek(1, 0)).toThrow(BsuirValidationError);
  });
});

describe("parseSemesterWeek", () => {
  it("accepts numeric and plain-text payloads", () => {
    expect(parseSemesterWeek(3)).toBe(3);
    expect(parseSemesterWeek("4")).toBe(4);
    expect(parseSemesterWeek("5\n")).toBe(5);
  });

  it("accepts known object payload shapes", () => {
    expect(parseSemesterWeek({ weekNumber: 2 })).toBe(2);
    expect(parseSemesterWeek({ currentWeek: "6" })).toBe(6);
  });

  it("throws for invalid payload", () => {
    expect(() => parseSemesterWeek("abc")).toThrow(BsuirValidationError);
    expect(() => parseSemesterWeek({})).toThrow(BsuirValidationError);
  });
});
