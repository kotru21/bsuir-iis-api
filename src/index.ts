export { createBsuirClient } from "./client/createClient";
export type { BsuirClient, BsuirClientShape } from "./client/createClient";

export type {
  BsuirClientOptions,
  CacheOptions,
  ClientHooks,
  ErrorHookContext,
  RequestHookContext,
  RequestOptions,
  ResponseHookContext,
  RetryHookContext,
} from "./client/types";
export type { ReadOptions } from "./modules/types";
export {
  buildScheduleDays,
  filterLessons,
  getCurrentLesson,
  getLessonsForDate,
  getLessonsForWeek,
  getNextLesson,
  getTodayLessons,
  getTomorrowLessons,
  groupLessonsByDay,
  normalizeSchedule,
  sortLessonsByTime,
} from "./modules/schedule";
export type {
  BuildScheduleDaysOptions,
  LessonWithTime,
  ScheduleDay,
  ScheduleFilterOptions,
} from "./types/schedule";
export {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirNetworkError,
  BsuirResponseValidationError,
  BsuirTimeoutError,
  BsuirValidationError,
} from "./client/errors";

export * from "./types";