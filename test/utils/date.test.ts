import { describe, expect, it } from "vitest";
import { parseDdMmYyyy } from "../../src/utils/date";

describe("parseDdMmYyyy", () => {
  it("parses valid dd.mm.yyyy values", () => {
    const parsed = parseDdMmYyyy("15.03.2026");
    expect(parsed?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("returns null for null and malformed values", () => {
    expect(parseDdMmYyyy(null)).toBeNull();
    expect(parseDdMmYyyy("2026-03-15")).toBeNull();
    expect(parseDdMmYyyy("15.03")).toBeNull();
  });
});
