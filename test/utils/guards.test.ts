import { describe, expect, it } from "vitest";
import { BsuirValidationError } from "../../src/client/errors";
import {
  assertEmployeeUrlId,
  assertGroupNumber,
  assertNonEmptyString,
  assertPositiveInt,
  isAbortError
} from "../../src/utils/guards";

describe("guards", () => {
  it("validates non-empty string values", () => {
    expect(() => assertNonEmptyString("abc", "field")).not.toThrow();
    expect(() => assertNonEmptyString("", "field")).toThrow(BsuirValidationError);
    expect(() => assertNonEmptyString(" ".repeat(3), "field")).toThrow(BsuirValidationError);
    expect(() => assertNonEmptyString(null, "field")).toThrow(BsuirValidationError);
    expect(() => assertNonEmptyString(123, "field")).toThrow(BsuirValidationError);
  });

  it("validates positive integer values", () => {
    expect(() => assertPositiveInt(1, "id")).not.toThrow();
    expect(() => assertPositiveInt(0, "id")).toThrow(BsuirValidationError);
    expect(() => assertPositiveInt(1.5, "id")).toThrow(BsuirValidationError);
    expect(() => assertPositiveInt("1", "id")).toThrow(BsuirValidationError);
  });

  it("exposes structured field/value metadata on validation errors", () => {
    try {
      assertGroupNumber("05350A", "groupNumber");
      throw new Error("expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(BsuirValidationError);
      expect(error).toMatchObject({
        field: "groupNumber",
        value: "05350A"
      });
    }
  });

  it("validates group number and employee urlId formats", () => {
    expect(() => assertGroupNumber("053503")).not.toThrow();
    expect(() => assertGroupNumber("05350A")).toThrow(BsuirValidationError);

    expect(() => assertEmployeeUrlId("s-nesterenkov")).not.toThrow();
    expect(() => assertEmployeeUrlId("s/nesterenkov")).toThrow(BsuirValidationError);
  });

  it("detects abort errors", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("aborted"))).toBe(false);
  });

  it("detects TimeoutError DOMException as abort (browser AbortSignal.timeout reason)", () => {
    expect(isAbortError(new DOMException("timed out", "TimeoutError"))).toBe(true);
  });

  // line 48 — Node.js abort style: error object with code === "ABORT_ERR"
  it("detects abort error via code ABORT_ERR (line 48)", () => {
    expect(isAbortError({ code: "ABORT_ERR" })).toBe(true);
  });

  it("returns false for null and primitives", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });
});
