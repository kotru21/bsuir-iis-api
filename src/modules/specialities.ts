import type { InternalClientConfig } from "../client/types";
import type { Speciality } from "../types/catalog";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/specialities`.
 */
export function createSpecialitiesModule(
  config: Readonly<InternalClientConfig>
): ListModule<Speciality> {
  return createListModule<Speciality>(config, "/specialities");
}
