import { BsuirValidationError } from "../client/errors";

// BSUIR IIS API accepts only numeric group IDs (e.g., "053503").
// Pattern is intentionally strict and covers only current IIS format.
const GROUP_NUMBER_PATTERN = /^\d+$/;
const EMPLOYEE_URL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * Asserts that `value` is a non-empty, non-whitespace-only string.
 * @public
 */
export function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BsuirValidationError(`'${fieldName}' must be a non-empty string`);
  }
}

/**
 * Asserts that `value` is a positive integer.
 * @public
 */
export function assertPositiveInt(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BsuirValidationError(`'${fieldName}' must be a positive integer`);
  }
}

/**
 * Asserts that `value` is a valid BSUIR student group number (digits only).
 * @public
 */
export function assertGroupNumber(value: unknown, fieldName = "groupNumber"): asserts value is string {
  assertNonEmptyString(value, fieldName);
  if (!GROUP_NUMBER_PATTERN.test(value)) {
    throw new BsuirValidationError(`'${fieldName}' must contain only digits`);
  }
}

/**
 * Asserts that `value` is a valid BSUIR employee URL-ID slug.
 * @public
 */
export function assertEmployeeUrlId(value: unknown, fieldName = "urlId"): asserts value is string {
  assertNonEmptyString(value, fieldName);
  if (!EMPLOYEE_URL_ID_PATTERN.test(value)) {
    throw new BsuirValidationError(
      `'${fieldName}' must be a valid slug (letters, digits, hyphen)`
    );
  }
}

/**
 * Returns `true` when the given value looks like an abort error.
 * Handles both browser `DOMException` and Node.js `Error` with `code: "ABORT_ERR"`.
 * @public
 */
export function isAbortError(error: unknown): boolean {
  // Browser: DOMException with name "AbortError"
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  // Node.js: Error-like object with code "ABORT_ERR"
  if (typeof error === "object" && error !== null) {
    const maybeError = error as { name?: unknown; code?: unknown };
    return maybeError.name === "AbortError" || maybeError.code === "ABORT_ERR";
  }

  return false;
}
