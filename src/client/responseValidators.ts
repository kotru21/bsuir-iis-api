import { BsuirResponseValidationError } from "./errors";
import type { ApiDateResponse } from "../types/common";
import type { ScheduleResponse } from "../types/schedule";

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function ensureRecord(payload: unknown, endpoint: string, expected: string): Record<string, unknown> {
  const record = asRecord(payload);
  if (!record) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected ${expected}`,
      endpoint
    );
  }
  return record;
}

function isNullableObject(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "object" && !Array.isArray(value));
}

/** @public */
export function assertArrayResponse(payload: unknown, endpoint: string): asserts payload is unknown[] {
  if (!Array.isArray(payload)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected array, got ${typeof payload}`,
      endpoint
    );
  }
}

/** @public */
export function assertApiDateResponse(
  payload: unknown,
  endpoint: string
): asserts payload is ApiDateResponse {
  const record = ensureRecord(payload, endpoint, "object with lastUpdateDate");
  if (typeof record.lastUpdateDate !== "string" || record.lastUpdateDate.trim().length === 0) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'lastUpdateDate' must be a non-empty string, got ${typeof record.lastUpdateDate}`,
      endpoint
    );
  }
}

/** @public */
export function assertScheduleResponse(
  payload: unknown,
  endpoint: string
): asserts payload is ScheduleResponse {
  const record = ensureRecord(payload, endpoint, "object");
  const schedules = record.schedules;
  const exams = record.exams;
  const employeeDto = record.employeeDto;
  const studentGroupDto = record.studentGroupDto;

  // undefined treated as absent field — API may omit schedules/exams for exam-only or schedule-only entries
  if (schedules !== null && schedules !== undefined) {
    if (typeof schedules !== "object" || Array.isArray(schedules)) {
      throw new BsuirResponseValidationError(
        `Invalid response payload for ${endpoint}: 'schedules' must be object or null, got ${
          Array.isArray(schedules) ? "array" : typeof schedules
        }`,
        endpoint
      );
    }
  }

  if (exams !== null && exams !== undefined) {
    if (!Array.isArray(exams)) {
      throw new BsuirResponseValidationError(
        `Invalid response payload for ${endpoint}: 'exams' must be array or null, got ${typeof exams}`,
        endpoint
      );
    }
  }

  if (!isNullableObject(employeeDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'employeeDto' must be object or null, got ${typeof employeeDto}`,
      endpoint
    );
  }

  if (!isNullableObject(studentGroupDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'studentGroupDto' must be object or null, got ${typeof studentGroupDto}`,
      endpoint
    );
  }
}
