/**
 * Read options used by all module methods.
 */
export interface ReadOptions {
  /**
   * Optional signal to cancel request from the caller side.
   */
  signal?: AbortSignal | undefined;
  /**
   * When true, return raw API payload where supported.
   */
  raw?: boolean;
}
