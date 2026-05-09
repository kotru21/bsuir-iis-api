import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { EmployeeCatalogItem } from "../types/employee";
import type { ReadOptions } from "./types";

export function createEmployeesModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of employees from `/employees/all`.
     * If the caller aborts `options.signal`, the platform propagates `AbortError` (not wrapped by the SDK).
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
      * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
      */
    async listAll(options: ReadOptions = {}): Promise<EmployeeCatalogItem[]> {
      const payload = await requestJson<unknown>(config, "/employees/all", {
        signal: options.signal
      });
      if (config.validateResponses) {
        assertArrayResponse(payload, "/employees/all");
      }
      return payload as EmployeeCatalogItem[];
    }
  };
}
