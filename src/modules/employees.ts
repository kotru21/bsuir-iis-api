import type { InternalClientConfig } from "../client/types";
import type { EmployeeCatalogItem } from "../types/employee";
import type { ReturnType as ListModuleReturn } from "./createListModule";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/employees/all`.
 * @public
 */
export function createEmployeesModule(config: Readonly<InternalClientConfig>): ListModuleReturn<EmployeeCatalogItem> {
  return createListModule<EmployeeCatalogItem>(config, "/employees/all");
}
