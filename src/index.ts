export { createBsuirClient } from "./client/createClient";
export type { BsuirClient, BsuirClientShape } from "./client/createClient";

export type {
  BsuirClientOptions,
  CacheOptions,
  CacheStore,
  ClientHooks,
  ErrorHookContext,
  QueryParams,
  QueryValue,
  RequestCacheMode,
  RequestHookContext,
  RequestMethod,
  RequestOptions,
  ResponseCacheEntry,
  ResponseHookContext,
  RetryHookContext
} from "./client/types";
export type { ReadOptions } from "./modules/types";
export type { AnnouncementReadOptions } from "./modules/announcements";
export type { ScheduleModule, ScheduleReadOptions } from "./modules/scheduleApi";
export type { InvalidLessonTimeHook } from "./helpers/schedule";
export {
  buildScheduleDays,
  getCurrentLesson,
  getLessonsForDate,
  getLessonsForWeek,
  getNextLesson,
  getTodayLessons,
  getTomorrowLessons,
  groupLessonsByDay,
  sortLessonsByTime
} from "./helpers/schedule";
export {
  formatEmployeeShortName,
  formatLessonAuditories,
  formatLessonEmployees,
  formatLessonSubgroup,
  formatLessonTimeRange,
  formatLessonType,
  formatLessonWeekNumbers
} from "./helpers/scheduleFormat";
export { filterLessons, normalizeSchedule } from "./modules/schedule";
export {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirResponseValidationError,
  BsuirTimeoutError,
  BsuirValidationError
} from "./client/errors";

export type { Announcement } from "./types/announcement";
export type {
  Auditory,
  AuditoryDepartment,
  AuditoryType,
  BuildingNumber,
  Department,
  EducationForm,
  Faculty,
  Speciality,
  SpecialityEducationForm,
  StudentGroupCatalogItem
} from "./types/catalog";
export { WEEKDAYS } from "./types/common";
export type { ApiDateResponse, Maybe, StudentGroupShort, Weekday } from "./types/common";
export type { Employee, EmployeeCatalogItem } from "./types/employee";
export type {
  BuildScheduleDaysOptions,
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  FlattenedScheduleSource,
  LessonWithTime,
  LessonStudentGroup,
  NormalizeScheduleOptions,
  NormalizedScheduleResponse,
  ScheduleDay,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse,
  WeekScheduleMap
} from "./types/schedule";
