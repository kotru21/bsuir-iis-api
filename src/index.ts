export { createBsuirClient } from "./client/createClient";
export type { BsuirClient } from "./client/createClient";

export type {
  BsuirClientOptions,
  CacheOptions,
  ClientHooks,
  ErrorHookContext,
  RequestHookContext,
  RequestOptions,
  ResponseHookContext,
  RetryHookContext
} from "./client/types";
export type { ReadOptions } from "./modules/types";
export { filterLessons, normalizeSchedule } from "./modules/schedule";
export {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirNetworkError,
  BsuirResponseValidationError,
  BsuirTimeoutError,
  BsuirValidationError
} from "./client/errors";

export * from "./types";
