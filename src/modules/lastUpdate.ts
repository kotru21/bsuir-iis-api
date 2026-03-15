import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import { assertNonEmptyString, assertPositiveInt } from "../utils/guards";
import type { ApiDateResponse } from "../types/common";
import type { ReadOptions } from "./types";

export function createLastUpdateModule(config: InternalClientConfig) {
  return {
    async byGroup(
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

    async byEmployee(
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
