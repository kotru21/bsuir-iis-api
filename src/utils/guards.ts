import { BsuirValidationError } from "../client/errors";

export function assertNonEmptyString(value: string, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new BsuirValidationError(`'${fieldName}' must be a non-empty string`);
  }
}

export function assertPositiveInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BsuirValidationError(`'${fieldName}' must be a positive integer`);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
