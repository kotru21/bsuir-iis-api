import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { EmployeeCatalogItem } from "../types/employee";
import type { ReadOptions } from "./types";

export function createEmployeesModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of employees from `/employees/all`.
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
     * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
     */
    async listAll(options: ReadOptions = {}): Promise<EmployeeCatalogItem[]> {
      return requestJson<EmployeeCatalogItem[]>(config, "/employees/all", {
        signal: options.signal
      });
    }
  };
}
