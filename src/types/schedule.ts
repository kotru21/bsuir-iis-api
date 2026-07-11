import type { StudentGroupCatalogItem } from "./catalog";
import type { Maybe, Weekday } from "./common";
import type { Employee } from "./employee";

/** Student group fragment nested under a schedule lesson. */
export interface LessonStudentGroup {
  specialityName: string;
  specialityCode: string;
  numberOfStudents: number;
  name: string;
  educationDegree: number;
}

/** One lesson or exam row as returned inside IIS schedule maps. */
export interface ScheduleItem {
  weekNumber: number[] | null;
  studentGroups: LessonStudentGroup[];
  numSubgroup: number;
  auditories: string[];
  startLessonTime: string;
  endLessonTime: string;
  subject: string;
  subjectFullName: string;
  note: Maybe<string>;
  lessonTypeAbbrev: Maybe<string>;
  dateLesson: Maybe<string>;
  startLessonDate: Maybe<string>;
  endLessonDate: Maybe<string>;
  announcement: boolean;
  split: boolean;
  employees: Maybe<Employee[]>;
}

/** Weekday → lessons map used by `schedules` / `nextSchedules`. */
export type WeekScheduleMap = Partial<Record<Weekday, ScheduleItem[]>>;

/** Raw IIS schedule envelope for a group or employee. */
export interface ScheduleResponse {
  employeeDto: Maybe<Employee>;
  studentGroupDto: Maybe<StudentGroupCatalogItem>;
  schedules: WeekScheduleMap | null;
  /** Additional schedules, e.g. for the next term. Shape not yet stable. */
  nextSchedules?: WeekScheduleMap | null;
  exams: ScheduleItem[] | null;
  startDate: Maybe<string>;
  endDate: Maybe<string>;
  startExamsDate: Maybe<string>;
  endExamsDate: Maybe<string>;
  /** Current academic term identifier. Shape not yet stable. */
  currentTerm?: unknown;
  /** Next academic term identifier. Shape not yet stable. */
  nextTerm?: unknown;
  /** Current period within the term. Shape not yet stable. */
  currentPeriod?: unknown;
  /** Whether the group follows a zaochnik or distance learning schedule. */
  isZaochOrDist?: boolean | null;
}

/** Where a flattened lesson came from in the IIS schedule envelope. */
export type FlattenedScheduleSource = "schedules" | "exams" | "nextSchedules";

/** Schedule lesson with weekday / source metadata added by {@link normalizeSchedule}. */
export interface FlattenedScheduleItem extends ScheduleItem {
  day: Weekday | null;
  source: FlattenedScheduleSource;
}

/** Lessons grouped by BSUIR weekday after normalization. */
export type FlattenedLessonsByDay = Record<Weekday, FlattenedScheduleItem[]>;

/** Criteria for {@link filterLessons} and schedule `get*Filtered` helpers. */
export interface ScheduleFilterOptions {
  source?: FlattenedScheduleSource;
  weekday?: Weekday;
  weekNumber?: number;
  subgroup?: number;
  lessonTypeAbbrev?: string | string[];
  subjectQuery?: string;
  employeeUrlId?: string;
  auditory?: string;
}

/**
 * Options for {@link normalizeSchedule}.
 */
export interface NormalizeScheduleOptions {
  /** When `true`, run full envelope validation via `assertScheduleResponse`. */
  validate?: boolean;
  /** Endpoint label used in validation / minimal-envelope errors. */
  endpoint?: string;
  /**
   * When `true`, flatten `nextSchedules` into `lessons` / `lessonsByDay` with
   * `source: "nextSchedules"`. Default `false` keeps current-term (`schedules`) only.
   */
  includeNextSchedules?: boolean;
}

/**
 * Normalized schedule payload: cloned maps plus flattened `lessons` views.
 * Default flatten covers current-term `schedules` and `exams` only.
 */
export interface NormalizedScheduleResponse extends Omit<ScheduleResponse, "schedules" | "exams"> {
  schedules: WeekScheduleMap;
  exams: ScheduleItem[];
  lessons: FlattenedScheduleItem[];
  lessonsByDay: FlattenedLessonsByDay;
  scheduleLessons: FlattenedScheduleItem[];
  examLessons: FlattenedScheduleItem[];
}

/**
 * Minimal time fields required for lesson-time helpers.
 * Used as a constraint for generic helpers like {@link sortLessonsByTime}.
 */
export type LessonWithTime = Pick<FlattenedScheduleItem, "startLessonTime" | "endLessonTime">;

/**
 * Options for {@link buildScheduleDays}.
 */
export interface BuildScheduleDaysOptions {
  /** Reference moment for "today" and current/next lesson detection. Defaults to `new Date()`. */
  now?: Date;
  /** First day of the range. Defaults to `now`. */
  startDate?: Date;
  /** Number of days to build. Must be a positive integer. Defaults to `7`. */
  days?: number;
  /**
   * Whether to include days with no lessons.
   * @defaultValue `true`
   */
  includeEmptyDays?: boolean;
  /**
   * Whether to compute `currentLesson` and `nextLesson` for today.
   * @defaultValue `true`
   */
  includeCurrentAndNextLessons?: boolean;
  /**
   * Callback fired once per lesson whose `startLessonTime` or `endLessonTime`
   * cannot be parsed as `HH:MM`. The lesson is otherwise still included in the
   * day's `lessons` array but sorted to the end. Use this to surface upstream
   * data issues that would otherwise be silently ignored.
   *
   * Errors thrown by the hook are caught and discarded.
   */
  onInvalidTime?: (info: {
    field: "startLessonTime" | "endLessonTime";
    value: string;
    lesson: { startLessonTime: string; endLessonTime: string };
  }) => void;
}

/**
 * A single day model produced by {@link buildScheduleDays}.
 */
export interface ScheduleDay {
  /** Local calendar date for this day. */
  date: Date;
  /** ISO-style date key in `"YYYY-MM-DD"` format for fast equality checks. */
  dateKey: string;
  /** BSUIR weekday name, or `null` for Sunday. */
  weekday: Weekday | null;
  /** Display label: weekday name, or `"Воскресенье"` for Sunday. */
  weekdayLabel: string;
  /** Lessons for this day sorted by start time. */
  lessons: FlattenedScheduleItem[];
  /** Whether this day matches the reference `now` date. */
  isToday: boolean;
  /** Whether there are any lessons on this day. */
  hasLessons: boolean;
  /**
   * Lesson active at `now`, or `null`.
   * Always `null` for days other than today, or when `includeCurrentAndNextLessons` is `false`.
   */
  currentLesson: FlattenedScheduleItem | null;
  /**
   * Next upcoming lesson after `now`, or `null`.
   * Always `null` for days other than today, or when `includeCurrentAndNextLessons` is `false`.
   */
  nextLesson: FlattenedScheduleItem | null;
}
