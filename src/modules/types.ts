import type { RequestOptions } from "../client/types";

export interface ReadOptions extends RequestOptions {
  raw?: boolean;
}
