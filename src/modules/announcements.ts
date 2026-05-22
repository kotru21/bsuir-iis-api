import { BsuirApiError } from "../client/errors";
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { Announcement } from "../types/announcement";
import { assertEmployeeUrlId, assertPositiveInt } from "../utils/guards";
import type { ReadOptions } from "./types";

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

/**
 * Fetches an announcement list, optionally converting 404 to empty array.
 *
 * The previous implementation inspected response bodies for marker strings like
 * "announcement"/"объяв" to decide whether to swallow the 404. That heuristic
 * masked genuine errors with similar wording and was fragile across API versions.
 * We now rely on the endpoint-scoped 404 status alone, with an opt-out.
 *
 * @returns The announcement list, or empty array for 404 when `treat404AsEmpty` is `true`
 * @throws {BsuirApiError} For non-404 errors, or any 404 when `treat404AsEmpty` is `false`
 * @throws {BsuirNetworkError} On transport failures
 * @throws {BsuirTimeoutError} When request times out
 */
async function requestAnnouncementList(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: AnnouncementReadOptions & { query: Record<string, string | number> }
): Promise<Announcement[]> {
  const treat404AsEmpty = options.treat404AsEmpty ?? true;
  try {
    const payload = await requestJson<unknown>(config, path, options);
    if (config.validateResponses) {
      assertArrayResponse(payload, path);
    }
    return payload as Announcement[];
  } catch (error) {
    if (
      treat404AsEmpty &&
      error instanceof BsuirApiError &&
      error.status === 404 &&
      endpointMatchesPath(error.endpoint, path)
    ) {
      return [];
    }
    throw error;
  }
}

/**
 *
 */
export function createAnnouncementsModule(config: Readonly<InternalClientConfig>): {
  byEmployee(urlId: string, options?: AnnouncementReadOptions): Promise<Announcement[]>;
  byDepartment(id: number, options?: AnnouncementReadOptions): Promise<Announcement[]>;
} {
  return {
    /**
     * Lists announcements for an employee.
     *
     * IIS responds with HTTP 404 when the employee has no announcements. By default
     * the SDK maps that to `[]`; pass `treat404AsEmpty: false` to receive the
     * underlying `BsuirApiError` instead.
     */
    async byEmployee(
      urlId: string,
      options: AnnouncementReadOptions = {}
    ): Promise<Announcement[]> {
      assertEmployeeUrlId(urlId, "urlId");
      return requestAnnouncementList(config, "/announcements/employees", {
        ...options,
        query: { "url-id": urlId }
      });
    },

    /**
     * Lists announcements for a department.
     *
     * IIS responds with HTTP 404 when the department has no announcements. By default
     * the SDK maps that to `[]`; pass `treat404AsEmpty: false` to receive the
     * underlying `BsuirApiError` instead.
     */
    async byDepartment(
      id: number,
      options: AnnouncementReadOptions = {}
    ): Promise<Announcement[]> {
      assertPositiveInt(id, "id");
      return requestAnnouncementList(config, "/announcements/departments", {
        ...options,
        query: { id }
      });
    }
  };
}
