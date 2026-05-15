import type { InternalClientConfig } from "../client/types";
import type { Auditory } from "../types/catalog";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/auditories`.
 */
export function createAuditoriesModule(
  config: Readonly<InternalClientConfig>
): ListModule<Auditory> {
  return createListModule<Auditory>(config, "/auditories");
}
