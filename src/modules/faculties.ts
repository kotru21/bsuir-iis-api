import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { Faculty } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createFacultiesModule(config: Readonly<InternalClientConfig>) {
  return {
    /**
     * Returns the full list of faculties from `/faculties`.
     * If the caller aborts `options.signal`, the platform propagates `AbortError` (not wrapped by the SDK).
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
      * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
      */
    async listAll(options: ReadOptions = {}): Promise<Faculty[]> {
      const payload = await requestJson<unknown>(config, "/faculties", {
        signal: options.signal
      });
      if (config.validateResponses) {
        assertArrayResponse(payload, "/faculties");
      }
      return payload as Faculty[];
    }
  };
}
