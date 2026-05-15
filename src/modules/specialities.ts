import type { InternalClientConfig } from "../client/types";
import type { Speciality } from "../types/catalog";
import type { ReturnType as ListModuleReturn } from "./createListModule";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/specialities`.
 * @public
 */
export function createSpecialitiesModule(config: Readonly<InternalClientConfig>): ListModuleReturn<Speciality> {
  return createListModule<Speciality>(config, "/specialities");
}
