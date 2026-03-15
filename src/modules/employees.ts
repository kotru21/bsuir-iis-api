import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { EmployeeCatalogItem } from "../types/employee";
import type { ReadOptions } from "./types";

export function createEmployeesModule(config: InternalClientConfig) {
  return {
    async listAll(options: ReadOptions = {}): Promise<EmployeeCatalogItem[]> {
      return requestJson<EmployeeCatalogItem[]>(config, "/employees/all", {
        signal: options.signal
      });
    }
  };
}
