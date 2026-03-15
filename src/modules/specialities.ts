import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Speciality } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createSpecialitiesModule(config: InternalClientConfig) {
  return {
    async listAll(options: ReadOptions = {}): Promise<Speciality[]> {
      return requestJson<Speciality[]>(config, "/specialities", {
        signal: options.signal
      });
    }
  };
}
