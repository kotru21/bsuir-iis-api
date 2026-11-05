import { BsuirApiError } from "../client/errors";
import { fetchAllSpringPages } from "../client/fetchAllPages";
import { requestJson } from "../client/http";
import { assertAnnouncementListResponse, assertListPayload } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { Announcement } from "../types/announcement";
import { deepFreezeJson } from "../utils/deepFreezeJson";
import { assertDepartmentUrlId, assertEmployeeUrlId } from "../utils/guards";
import type { ReadOptions } from "./types";

/** Hard safety cap on Spring pages fetched for one announcements call. */
const MAX_ANNOUNCEMENT_PAGES = 50;

/**
 * Options accepted by `announcements.byEmployee` and `announcements.byDepartment`.
 *
 * The BSUIR IIS API responds with HTTP 404 when no announcements exist for an
 * employee or department. By default this SDK converts that 404 into an empty
 * array. Set `treat404AsEmpty: false` to receive a `BsuirApiError` instead —
 * useful when you want to distinguish "entity not found" from "entity has no
 * announcements" at the call site.
 */
export interface AnnouncementReadOptions extends ReadOptions {
  /**
   * When `true` (the default), HTTP 404 responses from the announcements endpoint
   * are converted to an empty array. When `false`, the underlying `BsuirApiError`
   * is rethrown.
   *
   * @defaultValue true
   */
  treat404AsEmpty?: boolean;
}

function endpointMatchesPath(endpoint: string, path: string): boolean {
  try {
    return new URL(endpoint).pathname.endsWith(path);
  } catch {
    return false;
  }
}

function isFirstPageNotFound(
  error: BsuirApiError,
  path: string,
  treat404AsEmpty: boolean
): boolean {
  return (
    treat404AsEmpty &&
    error.status === 404 &&
    endpointMatchesPath(error.endpoint, path) &&
    !/[?&]page=/.test(error.endpoint)
  );
}

/**
 * Fetches an announcement list across all Spring Data pages (capped), optionally
 * converting a first-request 404 to an empty array.
 *
 * @returns The full announcement list, or empty array for first-request 404 when `treat404AsEmpty` is `true`
 * @throws {BsuirApiError} For non-404 errors, mid-pagination 404, or any 404 when `treat404AsEmpty` is `false`
 * @throws {BsuirResponseValidationError} On malformed pages or more than the 50-page safety cap
 * @throws {BsuirNetworkError} On transport failures
 * @throws {BsuirTimeoutError} When request times out
 */
async function requestAnnouncementList(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: AnnouncementReadOptions & { query: Record<string, string | number> }
): Promise<readonly Announcement[]> {
  const treat404AsEmpty = options.treat404AsEmpty ?? true;
  const baseQuery = options.query;

  // Forward only public read options: spreading the caller's object would also pass
  // runtime extras such as `method`, `headers` or `body` into the request pipeline.
  const fetchPage = async (query: Record<string, string | number>): Promise<unknown> =>
    requestJson<unknown>(config, path, {
      signal: options.signal,
      cache: options.cache,
      query,
      // Always set: the structural check must run before the cache write, or a 2xx HTML
      // page would be cached and fail every call until the TTL expired.
      responseValidator: (value) => {
        if (config.validateResponses) {
          assertAnnouncementListResponse(value, path);
        } else {
          assertListPayload(value, path);
        }
      }
    });

  try {
    const items = await fetchAllSpringPages<Announcement>(fetchPage, baseQuery, {
      maxPages: MAX_ANNOUNCEMENT_PAGES,
      resourceLabel: "Announcements",
      endpoint: path
    });
    // Items are frozen page payloads; freeze the concatenated list as well.
    return deepFreezeJson(items);
  } catch (error) {
    if (error instanceof BsuirApiError && isFirstPageNotFound(error, path, treat404AsEmpty)) {
      return Object.freeze([]);
    }
    throw error;
  }
}

/** Announcements module: employee / department list helpers. */
export interface AnnouncementsModule {
  byEmployee(urlId: string, options?: AnnouncementReadOptions): Promise<readonly Announcement[]>;
  /**
   * @param urlId - Department slug from the `/departments` catalog (`Department.urlId`,
   * e.g. `"kaf-vmip"`) — not the numeric `Department.id`, which IIS rejects with HTTP 400.
   */
  byDepartment(urlId: string, options?: AnnouncementReadOptions): Promise<readonly Announcement[]>;
}

/**
 * Creates the announcements module (`byEmployee`, `byDepartment`).
 */
export function createAnnouncementsModule(
  config: Readonly<InternalClientConfig>
): AnnouncementsModule {
  return {
    /**
     * Lists announcements for an employee.
     *
     * IIS responds with HTTP 404 when the employee has no announcements. By default
     * the SDK maps that to `[]`; pass `treat404AsEmpty: false` to receive the
     * underlying `BsuirApiError` instead.
     *
     * When IIS returns a paginated Spring Data envelope, all pages are fetched
     * (safety cap: 50 pages) and concatenated into a single `Announcement[]`.
     */
    async byEmployee(
      urlId: string,
      options: AnnouncementReadOptions = {}
    ): Promise<readonly Announcement[]> {
      assertEmployeeUrlId(urlId, "urlId");
      return requestAnnouncementList(config, "/announcements/employees", {
        ...options,
        query: { "url-id": urlId }
      });
    },

    /**
     * Lists announcements for a department, identified by its `urlId` slug
     * (`Department.urlId` from `client.departments.listAll()`, e.g. `"kaf-vmip"`).
     *
     * IIS answers an unknown slug with `[]`; a 404 is mapped to `[]` as well unless
     * `treat404AsEmpty: false` is passed.
     *
     * When IIS returns a paginated Spring Data envelope, all pages are fetched
     * (safety cap: 50 pages) and concatenated into a single `Announcement[]`.
     */
    async byDepartment(
      urlId: string,
      options: AnnouncementReadOptions = {}
    ): Promise<readonly Announcement[]> {
      assertDepartmentUrlId(urlId, "urlId");
      // IIS reads `url-id` (the department slug); the numeric `id` it used to take now
      // fails with HTTP 400.
      return requestAnnouncementList(config, "/announcements/departments", {
        ...options,
        query: { "url-id": urlId }
      });
    }
  };
}
