import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertNonEmptyString, assertPositiveInt } from "../utils/guards";
import type {
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleResponse
} from "../types/schedule";
import type { ApiDateResponse } from "../types/common";
import type { Weekday } from "../types/common";
import type { ReadOptions } from "./types";

const WEEKDAYS: Weekday[] = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота"
];

function normalizeSchedule(response: ScheduleResponse): NormalizedScheduleResponse {
  const lessons: FlattenedScheduleItem[] = [];
  for (const day of WEEKDAYS) {
    const dayItems = response.schedules[day] ?? [];
    for (const item of dayItems) {
      lessons.push({ ...item, day, source: "schedules" });
    }
  }

  for (const exam of response.exams) {
    lessons.push({
      ...exam,
      day: null,
      // Exams are not grouped by weekday in API response.
      source: "exams"
    });
  }

  return {
    ...response,
    lessons
  };
}

export function createScheduleModule(config: InternalClientConfig) {
  return {
    async getGroup(
      groupNumber: string,
      options: ReadOptions = {}
    ): Promise<ScheduleResponse | NormalizedScheduleResponse> {
      assertNonEmptyString(groupNumber, "groupNumber");
      const response = await requestJson<ScheduleResponse>(config, "/schedule", {
        query: { studentGroup: groupNumber },
        signal: options.signal
      });
      return options.raw ?? config.defaultRaw ? response : normalizeSchedule(response);
    },

    async getEmployee(
      urlId: string,
      options: ReadOptions = {}
    ): Promise<ScheduleResponse | NormalizedScheduleResponse> {
      assertNonEmptyString(urlId, "urlId");
      const response = await requestJson<ScheduleResponse>(config, `/employees/schedule/${urlId}`, {
        signal: options.signal
      });
      return options.raw ?? config.defaultRaw ? response : normalizeSchedule(response);
    },

    async getCurrentWeek(options: ReadOptions = {}): Promise<number> {
      return requestJson<number>(config, "/schedule/current-week", { signal: options.signal });
    },

    async getLastUpdateByGroup(
      params: { groupNumber: string } | { id: number },
      options: ReadOptions = {}
    ): Promise<ApiDateResponse> {
      let query: Record<string, string | number>;
      if ("groupNumber" in params) {
        assertNonEmptyString(params.groupNumber, "groupNumber");
        query = { groupNumber: params.groupNumber };
      } else {
        assertPositiveInt(params.id, "id");
        query = { id: params.id };
      }
      return requestJson<ApiDateResponse>(config, "/last-update-date/student-group", {
        query,
        signal: options.signal
      });
    },

    async getLastUpdateByEmployee(
      params: { urlId: string } | { id: number },
      options: ReadOptions = {}
    ): Promise<ApiDateResponse> {
      let query: Record<string, string | number>;
      if ("urlId" in params) {
        assertNonEmptyString(params.urlId, "urlId");
        query = { "url-id": params.urlId };
      } else {
        assertPositiveInt(params.id, "id");
        query = { id: params.id };
      }
      return requestJson<ApiDateResponse>(config, "/last-update-date/employee", {
        query,
        signal: options.signal
      });
    }
  };
}
