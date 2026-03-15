export { createBsuirClient } from "./client/createClient";
export type { BsuirClient } from "./client/createClient";
export { toCycleWeek } from "./utils/week";

export type { BsuirClientOptions, RequestOptions } from "./client/types";
export type { ReadOptions } from "./modules/types";
export {
  BsuirApiError,
  BsuirNetworkError,
  BsuirTimeoutError,
  BsuirValidationError
} from "./client/errors";

export * from "./types";
