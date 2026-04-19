import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Faculty } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createFacultiesModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of faculties from `/faculties`.
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
     * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
     */
    async listAll(options: ReadOptions = {}): Promise<Faculty[]> {
      return requestJson<Faculty[]>(config, "/faculties", {
        signal: options.signal
      });
    }
  };
}
