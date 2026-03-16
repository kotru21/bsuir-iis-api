import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { ReadOptions } from "./types";
import { parseSemesterWeek, toCycleWeek } from "../utils/week";

export function createCurrentWeekModule(config: InternalClientConfig) {
  /**
   * Returns current semester week number.
   */
  async function get(options: ReadOptions = {}): Promise<number> {
    const payload = await requestJson<unknown>(config, "/schedule/current-week", {
      signal: options.signal
    });
    return parseSemesterWeek(payload);
  }

  /**
   * Returns current cycle week number (1..4).
   */
  async function getCycle(options: ReadOptions & { weeksPerCycle?: number } = {}): Promise<number> {
    const semesterWeek = await get(options);
    return toCycleWeek(semesterWeek, options.weeksPerCycle);
  }

  return { get, getCycle };
}
