import type { InternalClientConfig } from "../client/types";
import type { EmployeeCatalogItem } from "../types/employee";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/employees/all`.
 */
export function createEmployeesModule(config: Readonly<InternalClientConfig>) {
  return createListModule<EmployeeCatalogItem>(config, "/employees/all");
}
