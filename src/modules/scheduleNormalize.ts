import {
  assertScheduleResponse,
  assertScheduleStructuralEnvelope
} from "../client/responseValidators";
import { asDayLessonArray } from "../helpers/scheduleDayLessons";
import { WEEKDAYS } from "../types/common";
import type {
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  NormalizeScheduleOptions,
  NormalizedScheduleResponse,
  ScheduleResponse
} from "../types/schedule";
import { deepFreezeJson } from "../utils/deepFreezeJson";
import { lessonAuditories } from "../utils/lessonAuditories";

function shouldFlattenNextSchedules(
  includeNextSchedules: boolean | undefined,
  currentLessonCount: number
): boolean {
  if (includeNextSchedules === true) {
    return true;
  }
  if (includeNextSchedules === false) {
    return false;
  }
  // Between terms IIS puts the published timetable in `nextSchedules` and
  // leaves `schedules` null. Opt-out with `{ includeNextSchedules: false }`.
  return currentLessonCount === 0;
}

/**
 * Transforms raw schedule response into normalized structure with flattened lessons.
 *
 * By default only current-term `schedules` and `exams` are flattened. When
 * `schedules` is empty (IIS between-term payload), `nextSchedules` is flattened
 * automatically. Pass `includeNextSchedules: true` to always include them, or
 * `false` to keep current-term rows only.
 *
 * The returned payload is **deep-frozen**: every view (`lessons`,
 * `lessonsByDay`, `scheduleLessons`, `examLessons`, `schedules`, `exams`) and
 * all nested objects share one immutable structure, so mutating any part of it
 * throws in strict mode. Clone a lesson explicitly if you need a mutable copy.
 * The input `response` is never mutated or frozen — normalization works on an
 * owned deep clone via `structuredClone`, so the input must be JSON-cloneable
 * (plain objects, arrays and primitives; no functions or class instances).
 */
export function normalizeSchedule(
  response: ScheduleResponse,
  options?: NormalizeScheduleOptions
): NormalizedScheduleResponse {
  const endpoint = options?.endpoint ?? "/schedule";
  if (options?.validate) {
    // Full envelope + item-field validation via the single source of truth.
    assertScheduleResponse(response, endpoint);
  } else {
    // Always-on structural shape (maps/arrays) — same rules as the deep path,
    // without item-field checks. Prevents silent empty schedules when IIS
    // returns `schedules: []` / non-array `exams`.
    assertScheduleStructuralEnvelope(response, endpoint);
  }

  // Own the data before building frozen views: freezing must never leak into the
  // caller's raw object through shared DTO references (employeeDto, nextSchedules…).
  const source = structuredClone(response);

  const scheduleLessons: FlattenedScheduleItem[] = [];
  const examLessons: FlattenedScheduleItem[] = [];
  const nextScheduleLessons: FlattenedScheduleItem[] = [];
  const lessonsByDay = Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as FlattenedLessonsByDay;
  const sourceSchedules = source.schedules ?? {};
  const normalizedSchedules: NonNullable<ScheduleResponse["schedules"]> = {};
  // Structural guard already rejected non-array non-nullish exams; null/absent → [].
  const normalizedExams = source.exams ?? [];

  for (const day of WEEKDAYS) {
    const dayItems = asDayLessonArray(sourceSchedules[day], endpoint, `schedules.${day}`);
    for (const item of dayItems) {
      item.auditories = lessonAuditories(item);
    }
    if (Object.hasOwn(sourceSchedules, day)) {
      normalizedSchedules[day] = dayItems;
    }

    const flattenedDayItems: FlattenedScheduleItem[] = dayItems.map((item) => ({
      ...item,
      day,
      source: "schedules" as const
    }));
    lessonsByDay[day] = flattenedDayItems;
    scheduleLessons.push(...flattenedDayItems);
  }

  for (const exam of normalizedExams) {
    exam.auditories = lessonAuditories(exam);
    const flattenedExam: FlattenedScheduleItem = {
      ...exam,
      day: null,
      source: "exams"
    };
    examLessons.push(flattenedExam);
  }

  if (shouldFlattenNextSchedules(options?.includeNextSchedules, scheduleLessons.length)) {
    const sourceNext = source.nextSchedules ?? {};
    for (const day of WEEKDAYS) {
      const dayItems = asDayLessonArray(sourceNext[day], endpoint, `nextSchedules.${day}`);
      for (const item of dayItems) {
        item.auditories = lessonAuditories(item);
      }
      const flattenedDayItems: FlattenedScheduleItem[] = dayItems.map((item) => ({
        ...item,
        day,
        source: "nextSchedules" as const
      }));
      lessonsByDay[day] = [...lessonsByDay[day], ...flattenedDayItems];
      nextScheduleLessons.push(...flattenedDayItems);
    }
  }

  const lessons = [...scheduleLessons, ...examLessons, ...nextScheduleLessons];

  // One freeze pass over the whole result keeps every view consistent: flattened
  // items share nested references with `schedules` / `exams`, so freezing per-view
  // used to leave those maps half-mutable (nested arrays frozen, item objects not).
  return deepFreezeJson({
    ...source,
    schedules: normalizedSchedules,
    exams: normalizedExams,
    lessons,
    lessonsByDay,
    scheduleLessons,
    examLessons
  });
}
