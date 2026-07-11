import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import { unwrapSpringPageContent } from "../client/springPage";
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
     *
     * IIS may return a plain array or a Spring Data page `{ content: [...] }`;
     * the SDK always resolves to `T[]` (first page only if paginated).
     */
    async listAll(options: ReadOptions = {}): Promise<T[]> {
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses
          ? (value) => {
              const unwrapped = unwrapSpringPageContent(value);
              assertArrayResponse(unwrapped, endpoint);
            }
          : undefined
      });
      return unwrapSpringPageContent(payload) as T[];
    }
  };
}
