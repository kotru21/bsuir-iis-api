import { BsuirApiError } from "../client/errors";
import { requestJson } from "../client/http";
import { assertArrayResponse } from "../client/responseValidators";
import type { InternalClientConfig } from "../client/types";
import type { Announcement } from "../types/announcement";
import { assertEmployeeUrlId, assertPositiveInt } from "../utils/guards";
import type { ReadOptions } from "./types";

const ANNOUNCEMENT_EMPTY_LIST_STATUSES = new Set<number>([404]);

function hasNoAnnouncementsMarker(body: unknown): boolean {
  if (body === null || body === "") {
    return true;
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  const record = body as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : "";
  if (message.length === 0) {
    return false;
  }
  const normalized = message.toLowerCase();
  return normalized.includes("announcement") || normalized.includes("объяв");
}

function endpointMatchesPath(endpoint: string, path: string): boolean {
  try {
    return new URL(endpoint).pathname.endsWith(path);
  } catch {
    return false;
  }
}

/**
 * Fetches an announcement list, converting explicit "no announcements" 404 envelopes to empty arrays.
 * This function normalizes those to an empty list instead of throwing an error.
 *
 * @returns The announcement list, or empty array for known no-announcements 404 responses
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
    assertArrayResponse(payload, path);
    return payload as Announcement[];
  } catch (error) {
    if (
      error instanceof BsuirApiError &&
      ANNOUNCEMENT_EMPTY_LIST_STATUSES.has(error.status) &&
      endpointMatchesPath(error.endpoint, path) &&
      hasNoAnnouncementsMarker(error.body)
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
  byEmployee(urlId: string, options?: ReadOptions): Promise<Announcement[]>;
  byDepartment(id: number, options?: ReadOptions): Promise<Announcement[]>;
} {
  return {
    /**
     * Lists announcements for an employee. IIS may return HTTP `404` (no announcements); the SDK maps it to `[]`.
     */
    async byEmployee(urlId: string, options: ReadOptions = {}): Promise<Announcement[]> {
      assertEmployeeUrlId(urlId, "urlId");
      return requestAnnouncementList(config, "/announcements/employees", {
        ...options,
        query: { "url-id": urlId }
      });
    },

    /**
     * Lists announcements for a department. IIS may return HTTP `404` (no announcements); the SDK maps it to `[]`.
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
