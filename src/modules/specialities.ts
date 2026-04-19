import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Speciality } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createSpecialitiesModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of specialities from `/specialities`.
     * If the caller aborts `options.signal`, the platform propagates `AbortError` (not wrapped by the SDK).
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
     * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
     */
    async listAll(options: ReadOptions = {}): Promise<Speciality[]> {
      return requestJson<Speciality[]>(config, "/specialities", {
        signal: options.signal
      });
    }
  };
}
