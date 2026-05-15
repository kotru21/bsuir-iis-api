import type { InternalClientConfig } from "../client/types";
import type { Department } from "../types/catalog";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/departments`.
 */
export function createDepartmentsModule(config: Readonly<InternalClientConfig>) {
  return createListModule<Department>(config, "/departments");
}
