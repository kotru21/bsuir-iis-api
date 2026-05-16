import type { RequestCacheMode } from "../client/types";

/**
 * Read options used by all module methods.
 */
export interface ReadOptions {
  /**
   * Optional signal to cancel request from the caller side.
   */
  signal?: AbortSignal | undefined;
  /**
   * Per-request cache mode.
   */
  cache?: RequestCacheMode | undefined;
}
