import { BsuirResponseValidationError } from "./errors";
import { describeValue } from "./responseValidators";
import { readSpringPageMeta, unwrapSpringPageContent, type SpringPageMeta } from "./springPage";

/** Options for {@link fetchAllSpringPages}. */
export interface FetchAllSpringPagesOptions {
  /** Hard safety cap on pages fetched for one logical call. */
  maxPages: number;
  /** Human label for error messages (e.g. "Announcements"). */
  resourceLabel: string;
  /** Request path reported on `BsuirResponseValidationError`. */
  endpoint: string;
}

function hasMorePages(meta: SpringPageMeta, nextPage: number, contentLength: number): boolean {
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

/**
 * Fetches all Spring Data pages (or returns a plain array payload as-is).
 * Caller supplies `fetchPage`; this helper only handles unwrap + page loop + cap.
 *
 * Every failure here is about the shape of what IIS returned (non-array page,
 * pagination that never advances, more pages than the safety cap), so all of them
 * are reported as {@link BsuirResponseValidationError} with the request `endpoint`.
 */
export async function fetchAllSpringPages<T>(
  fetchPage: (query: Record<string, string | number>) => Promise<unknown>,
  baseQuery: Record<string, string | number>,
  options: FetchAllSpringPagesOptions
): Promise<T[]> {
  const { maxPages, resourceLabel, endpoint } = options;
  const fail = (detail: string): never => {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: ${resourceLabel} ${detail}`,
      endpoint
    );
  };
  const asPageItems = (payload: unknown): T[] => {
    const pageItems = unwrapSpringPageContent(payload);
    if (!Array.isArray(pageItems)) {
      return fail(`page must be an array or a page envelope, got ${describeValue(pageItems)}`);
    }
    return pageItems as T[];
  };
  const assertWithinCap = (pageCount: number): void => {
    if (pageCount > maxPages) {
      fail(`pagination exceeds the SDK safety cap of ${String(maxPages)} pages`);
    }
  };

  const firstPayload = await fetchPage(baseQuery);
  const firstItems = asPageItems(firstPayload);
  const firstMeta = readSpringPageMeta(firstPayload);
  if (!firstMeta) {
    return firstItems;
  }

  if (typeof firstMeta.totalPages === "number") {
    assertWithinCap(firstMeta.totalPages);
  }
  const items = [...firstItems];
  let pageNumber = firstMeta.pageNumber;
  let meta = firstMeta;
  let pageContentLength = firstItems.length;

  while (hasMorePages(meta, pageNumber + 1, pageContentLength)) {
    const nextPage = pageNumber + 1;
    // `nextPage` is 0-based, so fetching it means `nextPage + 1` pages in total.
    assertWithinCap(nextPage + 1);
    const pagePayload = await fetchPage({
      ...baseQuery,
      page: nextPage,
      size: firstMeta.pageSize
    });
    const pageItems = asPageItems(pagePayload);
    items.push(...pageItems);
    const pageMeta = readSpringPageMeta(pagePayload);
    if (!pageMeta) {
      // Plain-array follow-up (or non-page envelope): accept items and stop.
      break;
    }
    // If the envelope never advances pageNumber while `last` stays false, the loop
    // would otherwise never end.
    if (pageMeta.pageNumber <= pageNumber) {
      fail(`pagination did not advance (pageNumber stayed at ${String(pageMeta.pageNumber)})`);
    }
    pageNumber = pageMeta.pageNumber;
    meta = pageMeta;
    pageContentLength = pageItems.length;
  }

  return items;
}
