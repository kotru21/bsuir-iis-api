import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Faculty } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createFacultiesModule(config: InternalClientConfig) {
  return {
    async listAll(options: ReadOptions = {}): Promise<Faculty[]> {
      return requestJson<Faculty[]>(config, "/faculties", {
        signal: options.signal
      });
    }
  };
}
