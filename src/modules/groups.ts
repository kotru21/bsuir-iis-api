import type { InternalClientConfig } from "../client/types";
import type { StudentGroupCatalogItem } from "../types/catalog";
import { createListModule } from "./createListModule";

/**
 * Creates API module for `/student-groups`.
 */
export function createGroupsModule(config: Readonly<InternalClientConfig>) {
  return createListModule<StudentGroupCatalogItem>(config, "/student-groups");
}
