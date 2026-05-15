import type { InternalClientConfig } from "../client/types";
import type { Auditory } from "../types/catalog";
import type { ReturnType as ListModuleReturn } from "./createListModule";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/auditories`.
 * @public
 */
export function createAuditoriesModule(config: Readonly<InternalClientConfig>): ListModuleReturn<Auditory> {
  return createListModule<Auditory>(config, "/auditories");
}
