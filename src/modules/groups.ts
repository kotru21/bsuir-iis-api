import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { StudentGroupCatalogItem } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createGroupsModule(config: InternalClientConfig) {
  return {
    /**
     * Returns the full list of student groups from `/student-groups`.
     * If the caller aborts `options.signal`, the platform propagates `AbortError` (not wrapped by the SDK).
     *
     * @throws {BsuirApiError} When the API returns a non-success HTTP status
     * @throws {BsuirNetworkError} On transport failures after retries
     * @throws {BsuirTimeoutError} When the request exceeds `timeoutMs`
     */
    async listAll(options: ReadOptions = {}): Promise<StudentGroupCatalogItem[]> {
      return requestJson<StudentGroupCatalogItem[]>(config, "/student-groups", {
        signal: options.signal
      });
    }
  };
}
