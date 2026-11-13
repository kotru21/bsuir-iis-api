import { BsuirValidationError } from "../client/errors";
import { requestJson } from "../client/http";
import {
  assertScheduleResponse,
  assertScheduleStructuralEnvelope
} from "../client/responseValidators";
import type { InternalClientConfig, QueryParams } from "../client/types";
import type {
  NormalizedScheduleResponse,
  ScheduleFilterOptions,
  ScheduleResponse
} from "../types/schedule";
import { assertScheduleFilter } from "../helpers/scheduleFilter";
import { assertEmployeeUrlId, assertGroupNumber } from "../utils/guards";
import { parseCurrentWeek } from "../utils/week";
import { normalizeSchedule } from "./scheduleNormalize";
import type { ReadOptions } from "./types";

/**
 * Whose timetable to read: a student group by number, or an employee by `urlId`.
 *
 * @example
 * ```ts
 * { group: "053503" }
 * { employee: "s-nesterenkov" }
 * ```
 */
export type ScheduleTarget =
  | { readonly group: string; readonly employee?: never }
  | { readonly employee: string; readonly group?: never };

/**
 * Read options for {@link ScheduleModule.get}.
 */
export interface ScheduleReadOptions extends ReadOptions {
  /**
   * When `true`, flatten IIS `nextSchedules` into `lessons` with
   * `source: "nextSchedules"`. Default (`undefined`) is current-term only
   * unless `schedules` is empty, in which case `nextSchedules` is used.
   * Pass `false` to never include next-term rows.
   */
  includeNextSchedules?: boolean;
  /**
   * Narrows every view of the result to matching lessons (see
   * `NormalizeScheduleOptions.filter`). `{ subgroup: 2 }` gives a complete schedule of
   * subgroup 2, shared lessons included, ready for `buildScheduleDays`.
   */
  filter?: ScheduleFilterOptions;
}

/**
 * Schedule module: one normalized read, the raw IIS envelope, and the current week.
 */
export interface ScheduleModule {
  /**
   * Normalized schedule of a group or an employee: cloned `schedules` / `exams` maps
   * plus flattened `lessons`, `lessonsByDay`, `scheduleLessons` and `examLessons`.
   *
   * @example
   * ```ts
   * const schedule = await client.schedule.get({ group: "053503" });
   * const exams = schedule.examLessons;
   * const mine = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 2 } });
   * const days = buildScheduleDays(mine, { days: 7 });
   * const lectures = await client.schedule.get(
   *   { employee: "s-nesterenkov" },
   *   { filter: { lessonTypeAbbrev: "ЛК" } }
   * );
   * ```
   */
  get(target: ScheduleTarget, options?: ScheduleReadOptions): Promise<NormalizedScheduleResponse>;
  /**
   * The schedule envelope exactly as IIS returns it (structurally checked, deep-frozen).
   */
  getRaw(target: ScheduleTarget, options?: ReadOptions): Promise<ScheduleResponse>;
  /** Current academic week number (1–4) reported by IIS. */
  getCurrentWeek(options?: ReadOptions): Promise<number>;
}

interface ResolvedTarget {
  /** Request path; also the endpoint label of validation errors. */
  path: string;
  query: QueryParams | undefined;
}

function resolveTarget(target: ScheduleTarget): ResolvedTarget {
  // Untyped callers may pass null or a bare string (the 2.x `getGroup("053503")` habit):
  // property reads on those yield undefined and fall into the error below.
  const record =
    (target as Partial<Record<"group" | "employee", unknown>> | null | undefined) ?? {};
  const hasGroup = record.group !== undefined;
  const hasEmployee = record.employee !== undefined;
  if (hasGroup === hasEmployee) {
    throw new BsuirValidationError(
      `'target' must be either { group: string } or { employee: string }, e.g. get({ group: "053503" })`,
      "target",
      target
    );
  }
  if (hasGroup) {
    assertGroupNumber(record.group, "target.group");
    return { path: "/schedule", query: { studentGroup: record.group } };
  }
  assertEmployeeUrlId(record.employee, "target.employee");
  return { path: `/employees/schedule/${encodeURIComponent(record.employee)}`, query: undefined };
}

/**
 * Creates the schedule module.
 */
export function createScheduleModule(config: Readonly<InternalClientConfig>): ScheduleModule {
  async function fetchEnvelope(
    resolved: ResolvedTarget,
    options: ReadOptions
  ): Promise<ScheduleResponse> {
    const payload = await requestJson<unknown>(config, resolved.path, {
      query: resolved.query,
      signal: options.signal,
      cache: options.cache,
      // Validate before cache write/hit so poisoned store entries cannot stick.
      responseValidator: (value) => {
        if (config.validateResponses) {
          assertScheduleResponse(value, resolved.path);
        } else {
          // Always-on map/array/day-bucket shape, without deep DTO checks.
          assertScheduleStructuralEnvelope(value, resolved.path);
        }
      }
    });
    return payload as ScheduleResponse;
  }

  return {
    async get(target, options = {}) {
      const resolved = resolveTarget(target);
      // Caller mistakes fail before a request is spent.
      if (options.filter) {
        assertScheduleFilter(options.filter);
      }
      const response = await fetchEnvelope(resolved, options);
      return normalizeSchedule(response, {
        validate: false,
        endpoint: resolved.path,
        ...(options.includeNextSchedules === undefined
          ? {}
          : { includeNextSchedules: options.includeNextSchedules }),
        ...(options.filter === undefined ? {} : { filter: options.filter })
      });
    },

    async getRaw(target, options = {}) {
      return fetchEnvelope(resolveTarget(target), options);
    },

    async getCurrentWeek(options = {}) {
      const endpoint = "/schedule/current-week";
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
        cache: options.cache,
        // Parse before the cache write (and on cache hits) so a maintenance page or
        // other junk body is never cached and served until the TTL expires.
        responseValidator: (value) => {
          parseCurrentWeek(value, endpoint);
        }
      });
      return parseCurrentWeek(payload, endpoint);
    }
  };
}
