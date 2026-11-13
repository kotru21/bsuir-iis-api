import type { InternalClientConfig } from "../client/types";
import type { Speciality } from "../types/catalog";
import { specialitySchema } from "../schema/dto";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/specialities`.
 */
export function createSpecialitiesModule(
  config: Readonly<InternalClientConfig>
): ListModule<Speciality> {
  return createListModule<Speciality>(config, "/specialities", specialitySchema);
}
