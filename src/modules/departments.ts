import type { InternalClientConfig } from "../client/types";
import type { Department } from "../types/catalog";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/departments`.
 */
export function createDepartmentsModule(
  config: Readonly<InternalClientConfig>
): ListModule<Department> {
  return createListModule<Department>(config, "/departments");
}
