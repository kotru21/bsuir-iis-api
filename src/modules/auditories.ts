import type { InternalClientConfig } from "../client/types";
import type { Auditory } from "../types/catalog";
import { auditorySchema } from "../schema/dto";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/auditories`.
 */
export function createAuditoriesModule(
  config: Readonly<InternalClientConfig>
): ListModule<Auditory> {
  return createListModule<Auditory>(config, "/auditories", auditorySchema);
}
