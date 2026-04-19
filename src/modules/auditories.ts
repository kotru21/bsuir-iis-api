import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Auditory } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createAuditoriesModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of auditories from `/auditories`.
     * If the caller aborts `options.signal`, the platform propagates `AbortError` (not wrapped by the SDK).
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
     * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
     */
    async listAll(options: ReadOptions = {}): Promise<Auditory[]> {
      return requestJson<Auditory[]>(config, "/auditories", {
        signal: options.signal
      });
    }
  };
}
