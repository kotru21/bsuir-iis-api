import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { ReadOptions } from "./types";

export function createCurrentWeekModule(config: InternalClientConfig) {
  return {
    async get(options: ReadOptions = {}): Promise<number> {
      return requestJson<number>(config, "/schedule/current-week", {
        signal: options.signal
      });
    }
  };
}
