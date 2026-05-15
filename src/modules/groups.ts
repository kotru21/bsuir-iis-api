import type { InternalClientConfig } from "../client/types";
import type { StudentGroupCatalogItem } from "../types/catalog";
import type { ReturnType as ListModuleReturn } from "./createListModule";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/student-groups`.
 * @public
 */
export function createGroupsModule(config: Readonly<InternalClientConfig>): ListModuleReturn<StudentGroupCatalogItem> {
  return createListModule<StudentGroupCatalogItem>(config, "/student-groups");
}
