import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { ReadOptions } from "./types";
import { toCycleWeek } from "../utils/week";

export function createCurrentWeekModule(config: InternalClientConfig) {
  return {
    /**
     * Returns current semester week number.
     */
    async get(options: ReadOptions = {}): Promise<number> {
      return requestJson<number>(config, "/schedule/current-week", {
        signal: options.signal
      });
    },

    /**
     * Returns current cycle week number (1..4).
     */
    async getCycle(options: ReadOptions & { weeksPerCycle?: number } = {}): Promise<number> {
      const semesterWeek = await this.get(options);
      return toCycleWeek(semesterWeek, options.weeksPerCycle);
    }
  };
}
