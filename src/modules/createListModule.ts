import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { ReadOptions } from "./types";

/**
 * Creates a simple catalog-like module exposing `listAll()` for a fixed endpoint.
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string,
) {
  return {
    /**
     * Returns all items from the configured endpoint.
     */
    async listAll(options: ReadOptions = {}): Promise<T[]> {
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
      });
      if (config.validateResponses) {
        assertArrayResponse(payload, endpoint);
      }
      return payload as T[];
    },
  };
}
