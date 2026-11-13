import { fetchAllSpringPages } from "../client/fetchAllPages";
import { requestJson } from "../client/http";
import { assertCatalogResponse, assertListPayload } from "../client/responseValidators";
import { unwrapSpringPageContent } from "../client/springPage";
import type { InternalClientConfig } from "../client/types";
import type { Schema } from "../schema/core";
import { deepFreezeJson } from "../utils/deepFreezeJson";
import type { ReadOptions } from "./types";

/** Hard safety cap on Spring pages fetched for one catalog `listAll` call. */
const MAX_CATALOG_PAGES = 50;

/**
 * Catalog module: `listAll()` returns the whole catalog.
 * Results are deep-frozen: copy (`[...items]`, `items.toSorted()`) before reordering.
 */
export interface ListModule<T> {
  /**
   * Returns every catalog item.
   *
   * IIS may answer with a plain array or a Spring Data page envelope
   * (`{ content: [...], totalPages, last, ... }`). A plain array is returned as-is (one
   * request); for an envelope, every page is fetched (`page` / `size` query) and
   * concatenated, under a 50-page safety cap.
   *
   * @throws `BsuirResponseValidationError` on a malformed page, pagination that does
   * not advance, or more than 50 pages.
   */
  listAll(options?: ReadOptions): Promise<readonly T[]>;
}

/**
 * Creates a catalog module exposing `listAll()` for a fixed endpoint.
 * `itemSchema` (bound to the DTO interface) validates every item in strict mode.
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string,
  itemSchema: Schema<T>
): ListModule<T> {
  // Always set, so even the structural check runs before the cache write and on cache
  // hits: a 2xx HTML page used to be cached and fail every call until the TTL expired.
  function responseValidator(value: unknown): void {
    if (config.validateResponses) {
      assertCatalogResponse(unwrapSpringPageContent(value), endpoint, itemSchema);
    } else {
      assertListPayload(value, endpoint);
    }
  }

  return {
    async listAll(options: ReadOptions = {}): Promise<readonly T[]> {
      const fetchPage = async (query: Record<string, string | number>): Promise<unknown> =>
        requestJson<unknown>(config, endpoint, {
          signal: options.signal,
          cache: options.cache,
          query,
          responseValidator
        });

      const items = await fetchAllSpringPages<T>(
        fetchPage,
        {},
        {
          maxPages: MAX_CATALOG_PAGES,
          resourceLabel: "Catalog",
          endpoint
        }
      );
      // Page payloads are frozen already; this freezes a concatenated multi-page list.
      return deepFreezeJson(items);
    }
  };
}
