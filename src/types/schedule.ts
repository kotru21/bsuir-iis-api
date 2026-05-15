import type { StudentGroupCatalogItem } from "./catalog";
import type { Maybe, Weekday } from "./common";
import type { Employee } from "./employee";

export interface LessonStudentGroup {
  specialityName: string;
  specialityCode: string;
  numberOfStudents: number;
  name: string;
  educationDegree: number;
}

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

export type WeekScheduleMap = Partial<Record<Weekday, ScheduleItem[]>>;

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

export interface FlattenedScheduleItem extends ScheduleItem {
  day: Weekday | null;
  source: "schedules" | "exams";
}

export type FlattenedLessonsByDay = Record<Weekday, FlattenedScheduleItem[]>;

export interface ScheduleFilterOptions {
  source?: "schedules" | "exams";
  weekday?: Weekday;
  weekNumber?: number;
  subgroup?: number;
  lessonTypeAbbrev?: string | string[];
  subjectQuery?: string;
  employeeUrlId?: string;
  auditory?: string;
}

export interface NormalizedScheduleResponse
  extends Omit<ScheduleResponse, "schedules" | "exams"> {
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
export type LessonWithTime = Pick<
  FlattenedScheduleItem,
  "startLessonTime" | "endLessonTime"
>;

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