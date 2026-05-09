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

export function assertArrayResponse(payload: unknown, endpoint: string): asserts payload is unknown[] {
  if (!Array.isArray(payload)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected array`,
      endpoint
    );
  }
}

export function assertApiDateResponse(
  payload: unknown,
  endpoint: string
): asserts payload is ApiDateResponse {
  const record = ensureRecord(payload, endpoint, "object");
  if (typeof record.lastUpdateDate !== "string") {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: missing 'lastUpdateDate' string`,
      endpoint
    );
  }
}

export function assertScheduleResponse(
  payload: unknown,
  endpoint: string
): asserts payload is ScheduleResponse {
  const record = ensureRecord(payload, endpoint, "object");
  const schedules = record.schedules;
  const exams = record.exams;
  const employeeDto = record.employeeDto;
  const studentGroupDto = record.studentGroupDto;

  if (schedules !== null && (typeof schedules !== "object" || Array.isArray(schedules))) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'schedules' must be object or null`,
      endpoint
    );
  }

  if (!(exams === null || Array.isArray(exams))) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'exams' must be array or null`,
      endpoint
    );
  }

  const nullableObject = (value: unknown): boolean => value === null || typeof value === "object";
  if (!nullableObject(employeeDto) || !nullableObject(studentGroupDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected nullable DTO objects`,
      endpoint
    );
  }
}
