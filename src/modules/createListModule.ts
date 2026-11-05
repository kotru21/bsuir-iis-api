import { BsuirResponseValidationError } from "../client/errors";
import { fetchAllSpringPages } from "../client/fetchAllPages";
import { requestJson } from "../client/http";
import { assertCatalogResponse, describeValue } from "../client/responseValidators";
import { unwrapSpringPageContent } from "../client/springPage";
import type { InternalClientConfig } from "../client/types";
import type { Schema } from "../schema/core";
import { deepFreezeJson } from "../utils/deepFreezeJson";
import type { ReadOptions } from "./types";

/** Hard safety cap on Spring pages fetched for one catalog `listAllPages` call. */
const MAX_CATALOG_PAGES = 50;

/**
 * Catalog module with first-page `listAll` and multi-page `listAllPages`.
 * Results are deep-frozen: copy (`[...items]`, `items.toSorted()`) before reordering.
 */
export interface ListModule<T> {
  listAll(options?: ReadOptions): Promise<readonly T[]>;
  listAllPages(options?: ReadOptions): Promise<readonly T[]>;
}

function assertUnwrappedList(payload: unknown, endpoint: string): unknown[] {
  const unwrapped = unwrapSpringPageContent(payload);
  if (!Array.isArray(unwrapped)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected array, got ${describeValue(unwrapped)}`,
      endpoint
    );
  }
  return unwrapped;
}

/**
 * Creates a simple catalog-like module exposing `listAll()` / `listAllPages()` for a fixed endpoint.
 * `itemSchema` (bound to the DTO interface) validates every item in strict mode.
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string,
  itemSchema: Schema<T>
): ListModule<T> {
  function responseValidator(value: unknown): void {
    const unwrapped = unwrapSpringPageContent(value);
    assertCatalogResponse(unwrapped, endpoint, itemSchema);
  }

  return {
    /**
     * Returns items from the configured endpoint (**first Spring page only** if
     * paginated — this is not a full-catalog fetch).
     *
     * IIS may return a plain array or a Spring Data page `{ content: [...] }`;
     * the SDK always resolves to `T[]`. Additional pages are not fetched — use
     * {@link ListModule.listAllPages} when the catalog may span multiple pages.
     */
    async listAll(options: ReadOptions = {}): Promise<readonly T[]> {
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses ? responseValidator : undefined
      });
      // Unwrapped from an already deep-frozen payload.
      return assertUnwrappedList(payload, endpoint) as readonly T[];
    },

    /**
     * Returns all catalog items across Spring Data pages (safety cap: 50 pages).
     *
     * Prefer this when IIS paginates the catalog. Plain array responses are
     * returned as-is. Exceeding the page cap throws `BsuirResponseValidationError`.
     */
    async listAllPages(options: ReadOptions = {}): Promise<readonly T[]> {
      const fetchPage = async (query: Record<string, string | number>): Promise<unknown> =>
        requestJson<unknown>(config, endpoint, {
          signal: options.signal,
          cache: options.cache,
          query,
          responseValidator: config.validateResponses ? responseValidator : undefined
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
      // Items are frozen page payloads; freeze the concatenated list as well.
      return deepFreezeJson(items);
    }
  };
}
