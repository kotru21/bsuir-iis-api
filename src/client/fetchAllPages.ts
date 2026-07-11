import { BsuirConfigurationError } from "./errors";
import { readSpringPageMeta, unwrapSpringPageContent, type SpringPageMeta } from "./springPage";

/** Options for {@link fetchAllSpringPages}. */
export interface FetchAllSpringPagesOptions {
  /** Hard safety cap on pages fetched for one logical call. */
  maxPages: number;
  /** Human label for configuration errors (e.g. "Announcements"). */
  resourceLabel: string;
}

function assertWithinPageCap(
  totalPages: number | undefined,
  maxPages: number,
  resourceLabel: string
): void {
  if (typeof totalPages === "number" && totalPages > maxPages) {
    throw new BsuirConfigurationError(
      `${resourceLabel} pagination exceeded safety cap of ${String(maxPages)} pages (totalPages=${String(totalPages)})`
    );
  }
}

function hasMorePages(meta: SpringPageMeta, nextPage: number): boolean {
  if (meta.last === true) {
    return false;
  }
  if (typeof meta.totalPages === "number") {
    return nextPage < meta.totalPages;
  }
  return meta.last === false;
}

function assertNextPageWithinCap(nextPage: number, maxPages: number, resourceLabel: string): void {
  if (nextPage >= maxPages) {
    throw new BsuirConfigurationError(
      `${resourceLabel} pagination exceeded safety cap of ${String(maxPages)} pages`
    );
  }
}

/**
 * Fetches all Spring Data pages (or returns a plain array payload as-is).
 * Caller supplies `fetchPage`; this helper only handles unwrap + page loop + cap.
 */
export async function fetchAllSpringPages<T>(
  fetchPage: (query: Record<string, string | number>) => Promise<unknown>,
  baseQuery: Record<string, string | number>,
  options: FetchAllSpringPagesOptions
): Promise<T[]> {
  const { maxPages, resourceLabel } = options;
  const firstPayload = await fetchPage(baseQuery);
  const firstMeta = readSpringPageMeta(firstPayload);
  if (!firstMeta) {
    return unwrapSpringPageContent(firstPayload) as T[];
  }

  assertWithinPageCap(firstMeta.totalPages, maxPages, resourceLabel);
  const items = [...(unwrapSpringPageContent(firstPayload) as T[])];
  let pageNumber = firstMeta.pageNumber;
  let meta = firstMeta;

  while (hasMorePages(meta, pageNumber + 1)) {
    const nextPage = pageNumber + 1;
    assertNextPageWithinCap(nextPage, maxPages, resourceLabel);
    const pagePayload = await fetchPage({
      ...baseQuery,
      page: nextPage,
      size: firstMeta.pageSize
    });
    const pageMeta = readSpringPageMeta(pagePayload);
    items.push(...(unwrapSpringPageContent(pagePayload) as T[]));
    if (!pageMeta) {
      break;
    }
    pageNumber = pageMeta.pageNumber;
    meta = pageMeta;
  }

  return items;
}
