import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";
import { assertPositiveInt } from "../utils/guards";
import { filterLessons } from "../helpers/scheduleFilter";
import type { ScheduleReadOptions } from "./scheduleApi";
import type { ReadOptions } from "./types";

export interface ScheduleSubjectFetcher {
  getNormalized(id: string, options?: ScheduleReadOptions): Promise<NormalizedScheduleResponse>;
  getRaw(id: string, options?: ReadOptions): Promise<ScheduleResponse>;
}

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
  getBySubgroupRaw(id: string, subgroup: number, options?: ReadOptions): Promise<ScheduleItem[]>;
  getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options?: ReadOptions
  ): Promise<ScheduleResponse>;
}

/**
 *
 */
export function filterRawSubgroupLessons(
  response: ScheduleResponse,
  subgroup: number
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const schedules = response.schedules ?? {};
  for (const dayItems of Object.values(schedules)) {
    for (const lesson of dayItems) {
      if (lesson.numSubgroup === subgroup) {
        items.push(structuredClone(lesson));
      }
    }
  }
  return items;
}

/**
 *
 */
export function filterRawSubgroupEnvelope(
  response: ScheduleResponse,
  subgroup: number
): ScheduleResponse {
  const cloned = structuredClone(response);
  const schedules = cloned.schedules ?? {};
  for (const day of Object.keys(schedules) as (keyof typeof schedules)[]) {
    const items = schedules[day] ?? [];
    schedules[day] = items.filter((lesson) => lesson.numSubgroup === subgroup);
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
    return getFiltered(id, { source: "schedules", subgroup }, options);
  }

  async function getBySubgroupRaw(
    id: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleItem[]> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    return filterRawSubgroupLessons(raw, subgroup);
  }

  async function getBySubgroupEnvelope(
    id: string,
    subgroup: number,
    options: ReadOptions = {}
  ): Promise<ScheduleResponse> {
    assertPositiveInt(subgroup, "subgroup");
    const raw = await fetcher.getRaw(id, options);
    return filterRawSubgroupEnvelope(raw, subgroup);
  }

  return {
    getFiltered,
    getExams,
    getBySubgroup,
    getBySubgroupRaw,
    getBySubgroupEnvelope
  };
}
