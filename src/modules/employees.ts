import type { InternalClientConfig } from "../client/types";
import type { EmployeeCatalogItem } from "../types/employee";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/employees/all`.
 */
export function createEmployeesModule(
  config: Readonly<InternalClientConfig>
): ListModule<EmployeeCatalogItem> {
  return createListModule<EmployeeCatalogItem>(config, "/employees/all");
}
