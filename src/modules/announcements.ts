import { BsuirApiError } from "../client/errors";
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { Announcement } from "../types/announcement";
import { assertEmployeeUrlId, assertPositiveInt } from "../utils/guards";
import type { ReadOptions } from "./types";

const ANNOUNCEMENT_EMPTY_LIST_STATUSES = new Set<number>([404, 400]);

/**
 * Fetches an announcement list, converting empty responses (404/400) to empty arrays.
 * The BSUIR IIS API returns 404 or 400 when an entity has no announcements or endpoint doesn't exist.
 * This function normalizes those to an empty list instead of throwing an error.
 *
 * @returns The announcement list, or empty array if API returned 404/400
 * @throws {BsuirApiError} For non-empty responses with error status codes
 * @throws {BsuirNetworkError} On transport failures
 * @throws {BsuirTimeoutError} When request times out
 */
async function requestAnnouncementList(
  config: Readonly<InternalClientConfig>,
  path: string,
  options: ReadOptions & { query: Record<string, string | number> }
): Promise<Announcement[]> {
  try {
    const payload = await requestJson<unknown>(config, path, options);
    if (config.validateResponses) {
      assertArrayResponse(payload, path);
    }
    return payload as Announcement[];
  } catch (error) {
    if (error instanceof BsuirApiError && ANNOUNCEMENT_EMPTY_LIST_STATUSES.has(error.status)) {
      return [];
    }
    throw error;
  }
}

export function createAnnouncementsModule(config: Readonly<InternalClientConfig>) {
  return {
    /**
     * Lists announcements for an employee. IIS may return HTTP `404` or `400` (no list / endpoint quirks); the SDK maps those to `[]`.
     */
    async byEmployee(urlId: string, options: ReadOptions = {}): Promise<Announcement[]> {
      assertEmployeeUrlId(urlId, "urlId");
      return requestAnnouncementList(config, "/announcements/employees", {
        ...options,
        query: { "url-id": urlId }
      });
    },

    /**
     * Lists announcements for a department. IIS may return HTTP `404` or `400` (no list / endpoint quirks); the SDK maps those to `[]`.
     */
    async byDepartment(id: number, options: ReadOptions = {}): Promise<Announcement[]> {
      assertPositiveInt(id, "id");
      return requestAnnouncementList(config, "/announcements/departments", {
        ...options,
        query: { id }
      });
    }
  };
}
