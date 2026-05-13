import type { InternalClientConfig } from "../client/types";
import type { Speciality } from "../types/catalog";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/specialities`.
 */
export function createSpecialitiesModule(config: Readonly<InternalClientConfig>) {
  return createListModule<Speciality>(config, "/specialities");
}
