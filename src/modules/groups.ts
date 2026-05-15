import type { InternalClientConfig } from "../client/types";
import type { StudentGroupCatalogItem } from "../types/catalog";
import { createListModule, type ListModule } from "./createListModule";

/**
 * Creates API module for `/student-groups`.
 */
export function createGroupsModule(
  config: Readonly<InternalClientConfig>
): ListModule<StudentGroupCatalogItem> {
  return createListModule<StudentGroupCatalogItem>(config, "/student-groups");
}
