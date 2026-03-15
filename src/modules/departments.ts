import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Department } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createDepartmentsModule(config: InternalClientConfig) {
  return {
    async listAll(options: ReadOptions = {}): Promise<Department[]> {
      return requestJson<Department[]>(config, "/departments", {
        signal: options.signal
      });
    }
  };
}
