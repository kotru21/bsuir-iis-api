import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import type { Weekday } from "../types/common";
import { assertPositiveInt } from "../utils/guards";
import { deepFreezeJson } from "../utils/deepFreezeJson";
import { cloneMutable, type DeepMutable } from "../utils/mutable";
import { asDayLessonArray } from "../helpers/scheduleDayLessons";
import { filterLessons, lessonMatchesSubgroup } from "../helpers/scheduleFilter";
import { shouldIncludeNextSchedules } from "./scheduleNormalize";
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
  ): Promise<readonly FlattenedScheduleItem[]>;
  getExams(id: string, options?: ScheduleReadOptions): Promise<readonly FlattenedScheduleItem[]>;
  getBySubgroup(
    id: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<readonly FlattenedScheduleItem[]>;
  getBySubgroupRaw(
    id: string,
    subgroup: number,
    options?: ScheduleReadOptions
  ): Promise<readonly ScheduleItem[]>;
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
  const cloned = cloneMutable(response);
  const keepSubgroup = (dayItems: unknown, field: string): DeepMutable<ScheduleItem>[] =>
    (asDayLessonArray(dayItems, options.endpoint, field) as DeepMutable<ScheduleItem>[]).filter(
      (lesson) => lessonMatchesSubgroup(lesson.numSubgroup, subgroup)
    );
  const schedules = cloned.schedules ?? {};
  for (const day of Object.keys(schedules) as Weekday[]) {
    schedules[day] = keepSubgroup(schedules[day], `schedules.${day}`);
  }
  if (options.includeNextSchedules === true) {
    const nextSchedules = cloned.nextSchedules ?? {};
    for (const day of Object.keys(nextSchedules) as Weekday[]) {
      nextSchedules[day] = keepSubgroup(nextSchedules[day], `nextSchedules.${day}`);
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
  ): Promise<readonly FlattenedScheduleItem[]> {
    const normalized = await fetcher.getNormalized(id, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
    });
    return deepFreezeJson(filterLessons(normalized, filter));
  }

  async function getExams(
    id: string,
    options: ScheduleReadOptions = {}
  ): Promise<readonly FlattenedScheduleItem[]> {
    return getFiltered(id, { source: "exams" }, options);
  }

  async function getBySubgroup(
    id: string,
    subgroup: number,
    options: ScheduleReadOptions = {}
  ): Promise<readonly FlattenedScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const normalized = await fetcher.getNormalized(id, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
      ...(options.includeNextSchedules === undefined
        ? {}
        : { includeNextSchedules: options.includeNextSchedules })
    });
    // Normalization already applied the next-term rule (explicit option or empty
    // current term), so only exams are dropped here.
    return deepFreezeJson(
      filterLessons(normalized, { subgroup }).filter((item) => item.source !== "exams")
    );
  }

  async function getBySubgroupRaw(
    id: string,
    subgroup: number,
    options: ScheduleReadOptions = {}
  ): Promise<readonly ScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    const endpoint = fetcher.endpoint(id);
    return deepFreezeJson(
      filterRawSubgroupLessons(raw, subgroup, {
        endpoint,
        includeNextSchedules: shouldIncludeNextSchedules(
          raw,
          options.includeNextSchedules,
          endpoint
        )
      })
    );
  }

  async function getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options: ScheduleReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    const endpoint = fetcher.endpoint(id);
    return deepFreezeJson(
      filterRawSubgroupEnvelope(raw, subgroup, {
        endpoint,
        includeNextSchedules: shouldIncludeNextSchedules(
          raw,
          options.includeNextSchedules,
          endpoint
        )
      })
    );
  }

  return {
    getFiltered,
    getExams,
    getBySubgroup,
    getBySubgroupRaw,
    getBySubgroupEnvelope
  };
}
