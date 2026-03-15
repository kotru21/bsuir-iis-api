import type { RequestOptions } from "../client/types";

/**
 * Read options used by all module methods.
 */
export interface ReadOptions extends RequestOptions {
  /**
   * When true, return raw API payload where supported.
   */
  raw?: boolean;
}
