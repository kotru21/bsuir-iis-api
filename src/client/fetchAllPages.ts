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

function hasMorePages(
  meta: SpringPageMeta,
  nextPage: number,
  contentLength: number
): boolean {
  if (meta.last === true) {
    return false;
  }
  if (typeof meta.totalPages === "number") {
    return nextPage < meta.totalPages;
  }
  if (meta.last === false) {
    return true;
  }
  // Neither `last` nor `totalPages`: a full page is the Spring heuristic for
  // "maybe more" — stop on a short/empty page to avoid silent first-page truncation.
  return contentLength >= meta.pageSize;
}

/** Cap is expressed as 0-based page index (`nextPage >= maxPages`). */
function assertNextPageWithinCap(nextPage: number, maxPages: number, resourceLabel: string): void {
  if (nextPage >= maxPages) {
    throw new BsuirConfigurationError(
      `${resourceLabel} pagination exceeded safety cap of ${String(maxPages)} pages`
    );
  }
}

function assertPageItemsArray(
  pageItems: unknown,
  resourceLabel: string
): asserts pageItems is unknown[] {
  if (!Array.isArray(pageItems)) {
    throw new BsuirConfigurationError(
      `${resourceLabel} pagination returned a non-array page payload`
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
  // firstMeta is only set when `content` is an array, so unwrap is safe here.
  const firstItems = unwrapSpringPageContent(firstPayload) as T[];
  const items = [...firstItems];
  let pageNumber = firstMeta.pageNumber;
  let meta = firstMeta;
  let pageContentLength = firstItems.length;

  while (hasMorePages(meta, pageNumber + 1, pageContentLength)) {
    const nextPage = pageNumber + 1;
    assertNextPageWithinCap(nextPage, maxPages, resourceLabel);
    const pagePayload = await fetchPage({
      ...baseQuery,
      page: nextPage,
      size: firstMeta.pageSize
    });
    const pageMeta = readSpringPageMeta(pagePayload);
    const pageItems = unwrapSpringPageContent(pagePayload);
    assertPageItemsArray(pageItems, resourceLabel);
    items.push(...(pageItems as T[]));
    if (!pageMeta) {
      // Plain-array follow-up (or non-page envelope): accept items and stop.
      break;
    }
    // Cap checks use nextPage = pageNumber + 1; if the envelope never advances
    // pageNumber while last remains false, the loop would otherwise never end.
    if (pageMeta.pageNumber <= pageNumber) {
      throw new BsuirConfigurationError(
        `${resourceLabel} pagination did not advance (pageNumber stayed at ${String(pageMeta.pageNumber)})`
      );
    }
    pageNumber = pageMeta.pageNumber;
    meta = pageMeta;
    pageContentLength = pageItems.length;
  }

  return items;
}
