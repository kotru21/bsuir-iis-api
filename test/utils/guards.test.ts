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
    expect(() => assertNonEmptyString("   ", "field")).toThrow(BsuirValidationError);
    expect(() => assertNonEmptyString(null, "field")).toThrow(BsuirValidationError);
    expect(() => assertNonEmptyString(123, "field")).toThrow(BsuirValidationError);
  });

  it("validates positive integer values", () => {
    expect(() => assertPositiveInt(1, "id")).not.toThrow();
    expect(() => assertPositiveInt(0, "id")).toThrow(BsuirValidationError);
    expect(() => assertPositiveInt(1.5, "id")).toThrow(BsuirValidationError);
    expect(() => assertPositiveInt("1", "id")).toThrow(BsuirValidationError);
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
});
