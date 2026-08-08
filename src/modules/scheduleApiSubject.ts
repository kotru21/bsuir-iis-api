import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import { assertPositiveInt } from "../utils/guards";
import { asDayLessonArray } from "../helpers/scheduleDayLessons";
import { filterLessons, lessonMatchesSubgroup } from "../helpers/scheduleFilter";
import type { ScheduleReadOptions } from "./scheduleApi";
import type { ReadOptions } from "./types";

/** Normalized/raw fetchers shared by group and employee schedule subject helpers. */
export interface ScheduleSubjectFetcher {
  getNormalized(id: string, options?: ScheduleReadOptions): Promise<NormalizedScheduleResponse>;
  getRaw(id: string, options?: ReadOptions): Promise<ScheduleResponse>;
  /** Request path used in typed validation errors from raw subgroup filters. */
  endpoint(id: string): string;
}

/** Filtered / exams / subgroup methods bound to one schedule subject. */
export interface ScheduleSubjectMethods {
  getFiltered(
    id: string,
    filter: ScheduleFilterOptions,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getExams(id: string, options?: ScheduleReadOptions): Promise<FlattenedScheduleItem[]>;
  getBySubgroup(
    id: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<FlattenedScheduleItem[]>;
  getBySubgroupRaw(
    id: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<ScheduleItem[]>;
  getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<ScheduleResponse>;
}

interface SubgroupFilterOptions {
  includeNextSchedules?: boolean;
  endpoint: string;
}

/**
 * Collects raw schedule lessons for `subgroup`, including shared lessons
 * (`numSubgroup === 0`).
 */
export function filterRawSubgroupLessons(
  response: ScheduleResponse,
  subgroup: number,
  options: SubgroupFilterOptions
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const schedules = response.schedules ?? {};
  for (const [day, dayValue] of Object.entries(schedules)) {
    const dayItems = asDayLessonArray(dayValue, options.endpoint, `schedules.${day}`);
    for (const lesson of dayItems) {
      if (lessonMatchesSubgroup(lesson.numSubgroup, subgroup)) {
        items.push(structuredClone(lesson));
      }
    }
  }
  if (options.includeNextSchedules === true) {
    const nextSchedules = response.nextSchedules ?? {};
    for (const [day, dayValue] of Object.entries(nextSchedules)) {
      const dayItems = asDayLessonArray(dayValue, options.endpoint, `nextSchedules.${day}`);
      for (const lesson of dayItems) {
        if (lessonMatchesSubgroup(lesson.numSubgroup, subgroup)) {
          items.push(structuredClone(lesson));
        }
      }
    }
  }
  return items;
}

/**
 * Returns a cloned envelope with `schedules` arrays filtered to `subgroup`,
 * including shared lessons (`numSubgroup === 0`).
 * When `includeNextSchedules` is true, `nextSchedules` is filtered the same way;
 * otherwise `nextSchedules` is stripped (current-term only, matching flattened helpers).
 */
export function filterRawSubgroupEnvelope(
  response: ScheduleResponse,
  subgroup: number,
  options: SubgroupFilterOptions
): ScheduleResponse {
  const cloned = structuredClone(response);
  const schedules = cloned.schedules ?? {};
  for (const day of Object.keys(schedules) as (keyof typeof schedules)[]) {
    const items = asDayLessonArray(schedules[day], options.endpoint, `schedules.${day}`);
    schedules[day] = items.filter((lesson) => lessonMatchesSubgroup(lesson.numSubgroup, subgroup));
  }
  if (options.includeNextSchedules === true) {
    const nextSchedules = cloned.nextSchedules ?? {};
    for (const day of Object.keys(nextSchedules) as (keyof typeof nextSchedules)[]) {
      const items = asDayLessonArray(nextSchedules[day], options.endpoint, `nextSchedules.${day}`);
      nextSchedules[day] = items.filter((lesson) =>
        lessonMatchesSubgroup(lesson.numSubgroup, subgroup)
      );
    }
  } else {
    delete cloned.nextSchedules;
  }
  return cloned;
}

/**
 * Builds filtered / exams / subgroup helpers for one schedule subject (group or employee).
 */
export function createScheduleSubjectMethods(
  fetcher: ScheduleSubjectFetcher
): ScheduleSubjectMethods {
  async function getFiltered(
    id: string,
    filter: ScheduleFilterOptions,
    options: ScheduleReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    const normalized = await fetcher.getNormalized(id, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
    });
    return filterLessons(normalized, filter);
  }

  async function getExams(
    id: string,
    options: ScheduleReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    return getFiltered(id, { source: "exams" }, options);
  }

  async function getBySubgroup(
    id: string,
    subgroup: number,
    options: ScheduleReadOptions = {}
  ): Promise<FlattenedScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const normalized = await fetcher.getNormalized(id, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
    });
    return filterLessons(normalized, { subgroup }).filter(
      (item) =>
        item.source === "schedules" ||
        (options.includeNextSchedules === true && item.source === "nextSchedules")
    );
  }

  async function getBySubgroupRaw(
    id: string,
    subgroup: number,
    options: ScheduleReadOptions = {}
  ): Promise<ScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    return filterRawSubgroupLessons(raw, subgroup, {
      endpoint: fetcher.endpoint(id),
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
    });
  }

  async function getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options: ScheduleReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    return filterRawSubgroupEnvelope(raw, subgroup, {
      endpoint: fetcher.endpoint(id),
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
    });
  }

  return {
    getFiltered,
    getExams,
    getBySubgroup,
    getBySubgroupRaw,
    getBySubgroupEnvelope
  };
}
