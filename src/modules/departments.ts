import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Department } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createDepartmentsModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of departments from `/departments`.
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
     * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
     */
    async listAll(options: ReadOptions = {}): Promise<Department[]> {
      return requestJson<Department[]>(config, "/departments", {
        signal: options.signal
      });
    }
  };
}
