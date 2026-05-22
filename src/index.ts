export { createBsuirClient } from "./client/createClient";
export type { BsuirClient, BsuirClientShape } from "./client/createClient";

export type {
  BsuirClientOptions,
  CacheOptions,
  ClientHooks,
  ErrorHookContext,
  QueryParams,
  QueryValue,
  RequestCacheMode,
  RequestHookContext,
  RequestMethod,
  RequestOptions,
  ResponseHookContext,
  RetryHookContext
} from "./client/types";
export type { ReadOptions } from "./modules/types";
export type { ScheduleModule } from "./modules/scheduleApi";
export {
  buildScheduleDays,
  filterLessons,
  formatEmployeeShortName,
  formatLessonAuditories,
  formatLessonEmployees,
  formatLessonSubgroup,
  formatLessonTimeRange,
  formatLessonType,
  formatLessonWeekNumbers,
  getCurrentLesson,
  getLessonsForDate,
  getLessonsForWeek,
  getNextLesson,
  getTodayLessons,
  getTomorrowLessons,
  groupLessonsByDay,
  normalizeSchedule,
  sortLessonsByTime
} from "./modules/schedule";
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
  LessonWithTime,
  LessonStudentGroup,
  NormalizedScheduleResponse,
  ScheduleDay,
  ScheduleFilterOptions,
  ScheduleItem,
  ScheduleResponse,
  WeekScheduleMap
} from "./types/schedule";
