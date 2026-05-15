import type { InternalClientConfig } from "../client/types";
import type { Department } from "../types/catalog";
import type { ReturnType as ListModuleReturn } from "./createListModule";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/departments`.
 * @public
 */
export function createDepartmentsModule(config: Readonly<InternalClientConfig>): ListModuleReturn<Department> {
  return createListModule<Department>(config, "/departments");
}
