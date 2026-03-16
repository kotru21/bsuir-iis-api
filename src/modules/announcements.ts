import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertEmployeeUrlId, assertPositiveInt } from "../utils/guards";
import type { Announcement } from "../types/announcement";
import type { ReadOptions } from "./types";

export function createAnnouncementsModule(config: InternalClientConfig) {
  return {
    async byEmployee(urlId: string, options: ReadOptions = {}): Promise<Announcement[]> {
      assertEmployeeUrlId(urlId, "urlId");
      return requestJson<Announcement[]>(config, "/announcements/employees", {
        query: { "url-id": urlId },
        signal: options.signal
      });
    },

    async byDepartment(id: number, options: ReadOptions = {}): Promise<Announcement[]> {
      assertPositiveInt(id, "id");
      return requestJson<Announcement[]>(config, "/announcements/departments", {
        query: { id },
        signal: options.signal
      });
    }
  };
}
