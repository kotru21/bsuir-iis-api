import type { InternalClientConfig } from "../client/types";
import type { Faculty } from "../types/catalog";
import type { ReturnType as ListModuleReturn } from "./createListModule";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/faculties`.
 * @public
 */
export function createFacultiesModule(config: Readonly<InternalClientConfig>): ListModuleReturn<Faculty> {
  return createListModule<Faculty>(config, "/faculties");
}
