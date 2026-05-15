import type { InternalClientConfig } from "../client/types";
import type { Faculty } from "../types/catalog";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/faculties`.
 */
export function createFacultiesModule(config: Readonly<InternalClientConfig>) {
  return createListModule<Faculty>(config, "/faculties");
}
