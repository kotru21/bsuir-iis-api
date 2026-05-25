import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { ReadOptions } from "./types";

export interface ListModule<T> {
  listAll(options?: ReadOptions): Promise<T[]>;
}

/**
 * Creates a simple catalog-like module exposing `listAll()` for a fixed endpoint.
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string
): ListModule<T> {
  return {
    /**
     * Returns all items from the configured endpoint.
     */
    async listAll(options: ReadOptions = {}): Promise<T[]> {
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses
          ? (value) => {
              assertArrayResponse(value, endpoint);
            }
          : undefined
      });
      return payload as T[];
    }
  };
}
