import type { InternalClientConfig } from "../client/types";
import { requestJson } from "../client/http";
import type { Auditory } from "../types/catalog";
import type { ReadOptions } from "./types";

export function createAuditoriesModule(config: InternalClientConfig) {
  return {
    async listAll(options: ReadOptions = {}): Promise<Auditory[]> {
      return requestJson<Auditory[]>(config, "/auditories", {
        signal: options.signal
      });
    }
  };
}
