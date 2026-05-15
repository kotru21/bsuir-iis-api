import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { ReadOptions } from "./types";

/**
 * Creates a simple catalog-like module exposing `listAll()` for a fixed endpoint.
 * @public
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string,
): { listAll(options?: ReadOptions): Promise<T[]> } {
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

/** Convenience re-export of the return type for modules built with createListModule. */
export interface ReturnType<T> { listAll(options?: ReadOptions): Promise<T[]> }
