import { describe, expect, it } from "vitest";
import { parseDdMmYyyy, parseDdMmYyyyParts } from "../../src/utils/date";

describe("parseDdMmYyyyParts", () => {
  it("parses valid dd.mm.yyyy values", () => {
    expect(parseDdMmYyyyParts("15.03.2026")).toEqual({ day: 15, month: 3, year: 2026 });
  });

  it("returns null for null and malformed values", () => {
    expect(parseDdMmYyyyParts(null)).toBeNull();
    expect(parseDdMmYyyyParts("2026-03-15")).toBeNull();
    expect(parseDdMmYyyyParts("15.03")).toBeNull();
    expect(parseDdMmYyyyParts("31.02.2026")).toBeNull();
  });
});

describe("parseDdMmYyyy", () => {
  it("parses valid dd.mm.yyyy values", () => {
    const parsed = parseDdMmYyyy("15.03.2026");
    expect(parsed?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("returns null for null and malformed values", () => {
    expect(parseDdMmYyyy(null)).toBeNull();
    expect(parseDdMmYyyy("2026-03-15")).toBeNull();
    expect(parseDdMmYyyy("15.03")).toBeNull();
    expect(parseDdMmYyyy("31.02.2026")).toBeNull();
  });
});
