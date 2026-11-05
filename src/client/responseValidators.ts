import { BsuirResponseValidationError } from "./errors";
import {
  array,
  asRecord,
  assertMatches,
  describeValue,
  failField,
  type Schema
} from "../schema/core";
import { announcementSchema, scheduleResponseSchema } from "../schema/dto";
import type { Announcement } from "../types/announcement";
import type { ScheduleResponse } from "../types/schedule";

export { describeValue } from "../schema/core";

/*
 * Two tiers of response checks:
 * - always-on structural guards (this file, hand-written): the minimum the SDK needs to
 *   honor its return types and never throw a raw `TypeError` while shaping data;
 * - deep strict-mode checks (`validateResponses` / `createBsuirClient.strict()`): the DTO
 *   schemas in `schema/dto`, compile-time bound to the public interfaces.
 */

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

const announcementListSchema = array(announcementSchema);

/**
 * Asserts that a catalog payload is an array whose items match `itemSchema`.
 */
export function assertCatalogResponse<T>(
  payload: unknown,
  endpoint: string,
  itemSchema: Schema<T>
): asserts payload is readonly T[] {
  if (!Array.isArray(payload)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected array, got ${describeValue(payload)}`,
      endpoint
    );
  }
  assertMatches(array(itemSchema), payload, endpoint);
}

/**
 * Asserts announcements payload: a plain array or a paginated envelope with `content`,
 * with every item checked against the `Announcement` schema.
 */
export function assertAnnouncementListResponse(
  payload: unknown,
  endpoint: string
): asserts payload is readonly Announcement[] | { content: readonly Announcement[] } {
  if (Array.isArray(payload)) {
    assertMatches(announcementListSchema, payload, endpoint);
    return;
  }

  const record = asRecord(payload);
  if (record && Array.isArray(record.content)) {
    // Item locations stay `[index]` for both shapes.
    assertMatches(announcementListSchema, record.content, endpoint);
    return;
  }

  throw new BsuirResponseValidationError(
    `Invalid response payload for ${endpoint}: expected array or paginated envelope with content`,
    endpoint
  );
}

/**
 * Map + day-bucket shape only (no lesson-item fields).
 * Nullish maps and nullish day buckets are allowed; non-array buckets fail.
 */
function assertWeekScheduleMapShape(value: unknown, endpoint: string, field: string): void {
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
  }
}

function assertNullableExamsField(value: unknown, endpoint: string): void {
  if (value !== null && value !== undefined && !Array.isArray(value)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'exams' must be array or null, got ${describeValue(value)}`,
      endpoint
    );
  }
}

/**
 * Always-on structural schedule envelope checks (no deep lesson-item validation).
 *
 * Ensures the payload is a non-null object, `schedules` / `nextSchedules` are
 * maps (object|null|absent) with array|nullish day buckets, and `exams` is
 * array|null|absent. Does **not** prove a full {@link ScheduleResponse} (DTO
 * fields and lesson items remain unchecked — use {@link assertScheduleResponse}).
 */
export function assertScheduleStructuralEnvelope(payload: unknown, endpoint: string): void {
  const record = ensureRecord(payload, endpoint, "object");
  assertWeekScheduleMapShape(record.schedules, endpoint, "schedules");
  assertWeekScheduleMapShape(record.nextSchedules, endpoint, "nextSchedules");
  assertNullableExamsField(record.exams, endpoint);
}

/**
 * Asserts that payload is a schedule response envelope.
 *
 * Structural guards first (stable messages for the common envelope failures), then the
 * `ScheduleResponse` schema: DTO fields, every lesson in `schedules` / `nextSchedules` /
 * `exams` with its nested employees and student groups. Fields are checked when present
 * (IIS may omit keys entirely on sparse payloads).
 */
export function assertScheduleResponse(
  payload: unknown,
  endpoint: string
): asserts payload is ScheduleResponse {
  assertScheduleStructuralEnvelope(payload, endpoint);
  assertMatches(scheduleResponseSchema, payload, endpoint);
}
