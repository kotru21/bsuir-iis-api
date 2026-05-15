import type { InternalClientConfig } from "../client/types";
import type { Faculty } from "../types/catalog";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/faculties`.
 */
export function createFacultiesModule(config: Readonly<InternalClientConfig>): ListModule<Faculty> {
  return createListModule<Faculty>(config, "/faculties");
}
