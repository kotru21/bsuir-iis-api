import type { InternalClientConfig } from "../client/types";
import type { Auditory } from "../types/catalog";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/auditories`.
 */
export function createAuditoriesModule(config: Readonly<InternalClientConfig>) {
  return createListModule<Auditory>(config, "/auditories");
}
