import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { StudentGroupCatalogItem } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createGroupsModule(config: InternalClientConfig) {
  return {
    async listAll(options: ReadOptions = {}): Promise<StudentGroupCatalogItem[]> {
      return requestJson<StudentGroupCatalogItem[]>(config, "/student-groups", {
        signal: options.signal
      });
    }
  };
}
