import { BsuirValidationError } from "../client/errors";

const GROUP_NUMBER_PATTERN = /^\d+$/;
const EMPLOYEE_URL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BsuirValidationError(`'${fieldName}' must be a non-empty string`);
  }
}

export function assertPositiveInt(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BsuirValidationError(`'${fieldName}' must be a positive integer`);
  }
}

export function assertGroupNumber(value: unknown, fieldName = "groupNumber"): asserts value is string {
  assertNonEmptyString(value, fieldName);
  if (!GROUP_NUMBER_PATTERN.test(value)) {
    throw new BsuirValidationError(`'${fieldName}' must contain only digits`);
  }
}

export function assertEmployeeUrlId(value: unknown, fieldName = "urlId"): asserts value is string {
  assertNonEmptyString(value, fieldName);
  if (!EMPLOYEE_URL_ID_PATTERN.test(value)) {
    throw new BsuirValidationError(
      `'${fieldName}' must be a valid slug (letters, digits, hyphen)`
    );
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as { name?: unknown; code?: unknown };
    return maybeError.name === "AbortError" || maybeError.code === "ABORT_ERR";
  }

  return false;
}
