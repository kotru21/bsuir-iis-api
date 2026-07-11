import { fetchAllSpringPages } from "../client/fetchAllPages";
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import { unwrapSpringPageContent } from "../client/springPage";
import type { InternalClientConfig } from "../client/types";
import type { ReadOptions } from "./types";

/** Hard safety cap on Spring pages fetched for one catalog `listAllPages` call. */
const MAX_CATALOG_PAGES = 50;

export interface ListModule<T> {
  listAll(options?: ReadOptions): Promise<T[]>;
  listAllPages(options?: ReadOptions): Promise<T[]>;
}

/**
 * Creates a simple catalog-like module exposing `listAll()` / `listAllPages()` for a fixed endpoint.
 */
export function createListModule<T>(
  config: Readonly<InternalClientConfig>,
  endpoint: string
): ListModule<T> {
  function responseValidator(value: unknown): void {
    const unwrapped = unwrapSpringPageContent(value);
    assertArrayResponse(unwrapped, endpoint);
  }

  return {
    /**
     * Returns items from the configured endpoint (first Spring page only if paginated).
     *
     * IIS may return a plain array or a Spring Data page `{ content: [...] }`;
     * the SDK always resolves to `T[]`. Additional pages are not fetched — use
     * {@link ListModule.listAllPages} when the catalog may span multiple pages.
     */
    async listAll(options: ReadOptions = {}): Promise<T[]> {
      const payload = await requestJson<unknown>(config, endpoint, {
        signal: options.signal,
        cache: options.cache,
        responseValidator: config.validateResponses ? responseValidator : undefined
      });
      return unwrapSpringPageContent(payload) as T[];
    },

    /**
     * Returns all catalog items across Spring Data pages (safety cap: 50 pages).
     *
     * Prefer this when IIS paginates the catalog. Plain array responses are
     * returned as-is. Exceeding the page cap throws `BsuirConfigurationError`.
     */
    async listAllPages(options: ReadOptions = {}): Promise<T[]> {
      const fetchPage = async (query: Record<string, string | number>): Promise<unknown> =>
        requestJson<unknown>(config, endpoint, {
          signal: options.signal,
          cache: options.cache,
          query,
          responseValidator: config.validateResponses ? responseValidator : undefined
        });

      return fetchAllSpringPages<T>(fetchPage, {}, {
        maxPages: MAX_CATALOG_PAGES,
        resourceLabel: "Catalog"
      });
    }
  };
}
