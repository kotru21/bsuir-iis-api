import { BsuirResponseValidationError } from "./errors";
import type { ApiDateResponse } from "../types/common";
import type { ScheduleResponse } from "../types/schedule";

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function ensureRecord(
  payload: unknown,
  endpoint: string,
  expected: string
): Record<string, unknown> {
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
  return (
    value === null || value === undefined || (typeof value === "object" && !Array.isArray(value))
  );
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function failField(endpoint: string, location: string, expectation: string, value: unknown): never {
  throw new BsuirResponseValidationError(
    `Invalid response payload for ${endpoint}: '${location}' must be ${expectation}, got ${describeValue(value)}`,
    endpoint
  );
}

// Item-level checks validate fields only when present: IIS omits some keys entirely
// on sparse payloads, and strict mode should flag wrong shapes, not missing data.
function assertNullableStringField(
  record: Record<string, unknown>,
  field: string,
  location: string,
  endpoint: string
): void {
  const value = record[field];
  if (value !== undefined && value !== null && typeof value !== "string") {
    failField(endpoint, `${location}.${field}`, "string or null", value);
  }
}

function assertStringField(
  record: Record<string, unknown>,
  field: string,
  location: string,
  endpoint: string
): void {
  const value = record[field];
  if (value !== undefined && typeof value !== "string") {
    failField(endpoint, `${location}.${field}`, "string", value);
  }
}

function assertFiniteNumberField(
  record: Record<string, unknown>,
  field: string,
  location: string,
  endpoint: string
): void {
  const value = record[field];
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    failField(endpoint, `${location}.${field}`, "a finite number", value);
  }
}

function assertBooleanField(
  record: Record<string, unknown>,
  field: string,
  location: string,
  endpoint: string
): void {
  const value = record[field];
  if (value !== undefined && typeof value !== "boolean") {
    failField(endpoint, `${location}.${field}`, "boolean", value);
  }
}

function assertObjectArrayField(
  record: Record<string, unknown>,
  field: string,
  location: string,
  endpoint: string,
  { nullable }: { nullable: boolean }
): void {
  const value = record[field];
  if (value === undefined || (nullable && value === null)) {
    return;
  }
  if (!Array.isArray(value)) {
    failField(endpoint, `${location}.${field}`, "an array of objects", value);
  }
  for (const [index, element] of value.entries()) {
    if (!asRecord(element)) {
      failField(endpoint, `${location}.${field}[${String(index)}]`, "an object", element);
    }
  }
}

function assertStringArrayField(
  record: Record<string, unknown>,
  field: string,
  location: string,
  endpoint: string
): void {
  const value = record[field];
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    failField(endpoint, `${location}.${field}`, "an array of strings", value);
  }
  for (const [index, element] of value.entries()) {
    if (typeof element !== "string") {
      failField(endpoint, `${location}.${field}[${String(index)}]`, "a string", element);
    }
  }
}

function assertScheduleItem(item: unknown, endpoint: string, location: string): void {
  const record = asRecord(item);
  if (!record) {
    failField(endpoint, location, "an object", item);
  }

  const weekNumber = record.weekNumber;
  if (weekNumber !== undefined && weekNumber !== null) {
    if (!Array.isArray(weekNumber)) {
      failField(endpoint, `${location}.weekNumber`, "an array of numbers or null", weekNumber);
    }
    for (const [index, week] of weekNumber.entries()) {
      if (typeof week !== "number" || !Number.isFinite(week)) {
        failField(endpoint, `${location}.weekNumber[${String(index)}]`, "a finite number", week);
      }
    }
  }

  const auditories = record.auditories;
  if (auditories !== undefined) {
    if (!Array.isArray(auditories)) {
      failField(endpoint, `${location}.auditories`, "an array of strings", auditories);
    }
    for (const [index, auditory] of auditories.entries()) {
      if (typeof auditory !== "string") {
        failField(endpoint, `${location}.auditories[${String(index)}]`, "a string", auditory);
      }
    }
  }

  assertStringField(record, "startLessonTime", location, endpoint);
  assertStringField(record, "endLessonTime", location, endpoint);
  assertStringField(record, "subject", location, endpoint);
  assertStringField(record, "subjectFullName", location, endpoint);
  assertNullableStringField(record, "note", location, endpoint);
  assertNullableStringField(record, "lessonTypeAbbrev", location, endpoint);
  assertNullableStringField(record, "dateLesson", location, endpoint);
  assertNullableStringField(record, "startLessonDate", location, endpoint);
  assertNullableStringField(record, "endLessonDate", location, endpoint);
  assertFiniteNumberField(record, "numSubgroup", location, endpoint);
  assertBooleanField(record, "announcement", location, endpoint);
  assertBooleanField(record, "split", location, endpoint);
  assertObjectArrayField(record, "studentGroups", location, endpoint, { nullable: false });
  assertObjectArrayField(record, "employees", location, endpoint, { nullable: true });
}

function assertWeekScheduleMap(value: unknown, endpoint: string, field: string): void {
  if (value === null || value === undefined) {
    return;
  }
  const record = asRecord(value);
  if (!record) {
    failField(endpoint, field, "object or null", value);
  }
  for (const [day, dayItems] of Object.entries(record)) {
    if (dayItems === undefined || dayItems === null) {
      continue;
    }
    if (!Array.isArray(dayItems)) {
      failField(endpoint, `${field}.${day}`, "an array of lessons", dayItems);
    }
    for (const [index, item] of dayItems.entries()) {
      assertScheduleItem(item, endpoint, `${field}.${day}[${String(index)}]`);
    }
  }
}

function assertAnnouncementItem(item: unknown, endpoint: string, location: string): void {
  const record = asRecord(item);
  if (!record) {
    failField(endpoint, location, "an object", item);
  }
  assertFiniteNumberField(record, "id", location, endpoint);
  assertStringField(record, "employee", location, endpoint);
  assertStringField(record, "content", location, endpoint);
  assertStringField(record, "date", location, endpoint);
  assertStringArrayField(record, "employeeDepartments", location, endpoint);
  assertObjectArrayField(record, "studentGroups", location, endpoint, { nullable: false });
}

function assertAnnouncementItems(items: unknown[], endpoint: string): void {
  for (const [index, item] of items.entries()) {
    assertAnnouncementItem(item, endpoint, `[${String(index)}]`);
  }
}

/**
 * Asserts that payload is an array of catalog objects.
 *
 * Catalog endpoints share this generic check: elements are validated as
 * non-null objects. Per-field catalog validation is intentionally out of
 * scope — catalog DTOs vary per endpoint and are consumed as typed views.
 */
export function assertArrayResponse(
  payload: unknown,
  endpoint: string
): asserts payload is unknown[] {
  if (!Array.isArray(payload)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected array, got ${typeof payload}`,
      endpoint
    );
  }
  for (const [index, item] of payload.entries()) {
    if (!asRecord(item)) {
      failField(endpoint, `[${String(index)}]`, "an object", item);
    }
  }
}

/**
 * Asserts announcements payload: a plain array or a paginated envelope with `content`,
 * with field-level checks on each announcement item.
 */
export function assertAnnouncementListResponse(
  payload: unknown,
  endpoint: string
): asserts payload is unknown[] | { content: unknown[] } {
  if (Array.isArray(payload)) {
    assertAnnouncementItems(payload, endpoint);
    return;
  }

  const record = asRecord(payload);
  if (record && Array.isArray(record.content)) {
    assertAnnouncementItems(record.content, endpoint);
    return;
  }

  throw new BsuirResponseValidationError(
    `Invalid response payload for ${endpoint}: expected array or paginated envelope with content`,
    endpoint
  );
}

/**
 * Asserts that payload matches `{ lastUpdateDate: string }`.
 */
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

/**
 * Asserts that payload is a schedule response envelope.
 *
 * Checks the envelope (`schedules` / `nextSchedules` maps, `exams`, DTO fields)
 * and every lesson item: field-level shape checks apply when a field is
 * present (IIS may omit keys entirely on sparse payloads).
 */
export function assertScheduleResponse(
  payload: unknown,
  endpoint: string
): asserts payload is ScheduleResponse {
  const record = ensureRecord(payload, endpoint, "object");
  const schedules = record.schedules;

  // undefined treated as absent field — API may omit schedules/exams for exam-only or schedule-only entries
  if (
    schedules !== null &&
    schedules !== undefined &&
    (typeof schedules !== "object" || Array.isArray(schedules))
  ) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'schedules' must be object or null, got ${
        Array.isArray(schedules) ? "array" : typeof schedules
      }`,
      endpoint
    );
  }
  assertWeekScheduleMap(schedules, endpoint, "schedules");
  assertWeekScheduleMap(record.nextSchedules, endpoint, "nextSchedules");

  const exams = record.exams;
  if (exams !== null && exams !== undefined && !Array.isArray(exams)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'exams' must be array or null, got ${typeof exams}`,
      endpoint
    );
  }
  if (Array.isArray(exams)) {
    for (const [index, exam] of exams.entries()) {
      assertScheduleItem(exam, endpoint, `exams[${String(index)}]`);
    }
  }

  const employeeDto = record.employeeDto;
  if (!isNullableObject(employeeDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'employeeDto' must be object or null, got ${typeof employeeDto}`,
      endpoint
    );
  }

  const studentGroupDto = record.studentGroupDto;

  if (!isNullableObject(studentGroupDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'studentGroupDto' must be object or null, got ${typeof studentGroupDto}`,
      endpoint
    );
  }
}
