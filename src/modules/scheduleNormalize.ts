import {
  assertScheduleResponse,
  assertScheduleStructuralEnvelope
} from "../client/responseValidators";
import { asDayLessonArray } from "../helpers/scheduleDayLessons";
import { assertScheduleFilter, lessonMatchesFilter } from "../helpers/scheduleFilter";
import { isWeekday, WEEKDAYS, type Weekday } from "../types/common";
import type {
  FlattenedScheduleItem,
  FlattenedScheduleSource,
  NormalizeScheduleOptions,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import { deepFreezeJson } from "../utils/deepFreezeJson";
import { lessonAuditories } from "../utils/lessonAuditories";
import { cloneMutable, type DeepMutable } from "../utils/mutable";

/** Owned lesson after {@link normalizeSchedule} replaced a `null` `auditories` with `[]`. */
type MutableItem = DeepMutable<ScheduleItem> & { auditories: string[] };

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

/** Lessons of one bucket that pass the filter, in raw and flattened form. */
interface BucketView {
  items: MutableItem[];
  flattened: FlattenedScheduleItem[];
}

/**
 * Transforms raw schedule response into normalized structure with flattened lessons.
 *
 * By default only current-term `schedules` and `exams` are flattened. When
 * `schedules` is empty (IIS between-term payload), `nextSchedules` is flattened
 * automatically. Pass `includeNextSchedules: true` to always include them, or
 * `false` to keep current-term rows only.
 *
 * With `filter`, **every** view is narrowed to matching lessons — `lessons`,
 * `lessonsByDay`, `scheduleLessons`, `examLessons` and the `schedules` / `exams` /
 * `nextSchedules` maps — so the result is a complete schedule of, e.g., one subgroup
 * that date helpers (`buildScheduleDays`, …) accept as-is. The next-term rule above is
 * decided on the unfiltered timetable.
 *
 * Only {@link WEEKDAYS} buckets are flattened into `lessons` / `lessonsByDay`.
 * Buckets under any other key (e.g. `"Воскресенье"`) are kept in `schedules` as-is;
 * with `validate: true` a non-empty one fails with `BsuirResponseValidationError`.
 *
 * The returned payload is **deep-frozen**: every view and all nested objects share one
 * immutable structure, so mutating any part of it throws in strict mode. Clone a lesson
 * explicitly if you need a mutable copy. The input `response` is never mutated or
 * frozen — normalization works on an owned deep clone via `structuredClone`, so the
 * input must be JSON-cloneable (plain objects, arrays and primitives).
 */
export function normalizeSchedule(
  response: ScheduleResponse,
  options?: NormalizeScheduleOptions
): NormalizedScheduleResponse {
  type MutableDayMap = Record<string, MutableItem[]>;
  /** Owned day map before `ownedBucket` normalized its lessons. */
  type SourceDayMap = Record<string, DeepMutable<ScheduleItem>[]>;
  const endpoint = options?.endpoint ?? "/schedule";
  const filter: ScheduleFilterOptions | undefined = options?.filter;
  if (filter) {
    assertScheduleFilter(filter);
  }
  if (options?.validate) {
    // Full envelope + DTO schema validation.
    assertScheduleResponse(response, endpoint);
  } else {
    // Always-on structural shape (maps/arrays), without item-field checks. Prevents
    // silent empty schedules when IIS returns `schedules: []` / non-array `exams`.
    assertScheduleStructuralEnvelope(response, endpoint);
  }

  // Own the data before building frozen views: freezing must never leak into the
  // caller's raw object through shared DTO references (employeeDto, nextSchedules…).
  const source = cloneMutable(response);

  /** Day bucket as an owned array with normalized `auditories`. */
  const ownedBucket = (dayItems: unknown, field: string): MutableItem[] => {
    // The structural guard above accepted the bucket; the clone is ours to edit.
    const items = asDayLessonArray(dayItems, endpoint, field) as MutableItem[];
    for (const item of items) {
      item.auditories = lessonAuditories(item);
    }
    return items;
  };

  /** Flattens a bucket and keeps the lessons (raw + flattened) that pass `filter`. */
  const viewOf = (
    items: MutableItem[],
    day: Weekday | null,
    lessonSource: FlattenedScheduleSource
  ): BucketView => {
    const view: BucketView = { items: [], flattened: [] };
    for (const item of items) {
      const flattened: FlattenedScheduleItem = { ...item, day, source: lessonSource };
      if (filter && !lessonMatchesFilter(flattened, filter)) {
        continue;
      }
      view.items.push(item);
      view.flattened.push(flattened);
    }
    return view;
  };

  const scheduleLessons: FlattenedScheduleItem[] = [];
  const nextScheduleLessons: FlattenedScheduleItem[] = [];
  const lessonsByDay = Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as Record<Weekday, FlattenedScheduleItem[]>;

  // Current term. The next-term fallback below is decided on the unfiltered count:
  // filtering one subgroup out of a populated term must not pull in next-term rows.
  const sourceSchedules: SourceDayMap = source.schedules ?? {};
  const normalizedSchedules: MutableDayMap = {};
  let currentLessonCount = 0;
  for (const day of WEEKDAYS) {
    const items = ownedBucket(sourceSchedules[day], `schedules.${day}`);
    currentLessonCount += items.length;
    const view = viewOf(items, day, "schedules");
    if (Object.hasOwn(sourceSchedules, day)) {
      normalizedSchedules[day] = view.items;
    }
    lessonsByDay[day] = view.flattened;
    scheduleLessons.push(...view.flattened);
  }
  // Keys outside WEEKDAYS (e.g. "Воскресенье") cannot be flattened into the weekday
  // views, but must not silently vanish either: they stay in `schedules` like any other
  // bucket. `validate: true` / strict clients reject non-empty ones as contract drift.
  for (const [key, dayItems] of Object.entries(sourceSchedules)) {
    if (isWeekday(key)) {
      continue;
    }
    normalizedSchedules[key] = viewOf(
      ownedBucket(dayItems, `schedules.${key}`),
      null,
      "schedules"
    ).items;
  }

  // Structural guard already rejected non-array non-nullish exams; null/absent → [].
  const examView = viewOf(ownedBucket(source.exams ?? [], "exams"), null, "exams");

  // Next term: flattened per the rule above; the map itself is narrowed when filtering.
  const flattenNext = shouldFlattenNextSchedules(options?.includeNextSchedules, currentLessonCount);
  const sourceNext: SourceDayMap | null | undefined = source.nextSchedules;
  const filteredNext: MutableDayMap = {};
  if (sourceNext && (flattenNext || filter)) {
    for (const day of WEEKDAYS) {
      const view = viewOf(
        ownedBucket(sourceNext[day], `nextSchedules.${day}`),
        day,
        "nextSchedules"
      );
      if (Object.hasOwn(sourceNext, day)) {
        filteredNext[day] = view.items;
      }
      if (!flattenNext) {
        continue;
      }
      lessonsByDay[day] = [...lessonsByDay[day], ...view.flattened];
      nextScheduleLessons.push(...view.flattened);
    }
    for (const [key, dayItems] of Object.entries(sourceNext)) {
      if (isWeekday(key)) {
        continue;
      }
      filteredNext[key] = viewOf(
        ownedBucket(dayItems, `nextSchedules.${key}`),
        null,
        "nextSchedules"
      ).items;
    }
  }

  const lessons = [...scheduleLessons, ...examView.flattened, ...nextScheduleLessons];

  // One freeze pass over the whole result keeps every view consistent: flattened
  // items share nested references with the maps, so freezing per-view used to leave
  // those maps half-mutable (nested arrays frozen, item objects not).
  const normalized: NormalizedScheduleResponse = {
    ...source,
    ...(filter && sourceNext ? { nextSchedules: filteredNext } : {}),
    schedules: normalizedSchedules,
    exams: examView.items,
    lessons,
    lessonsByDay,
    scheduleLessons,
    examLessons: examView.flattened
  };
  return deepFreezeJson(normalized);
}
