import type { StudentGroupCatalogItem } from "./catalog";
import type { Maybe, Weekday } from "./common";
import type { Employee } from "./employee";

/** Student group fragment nested under a schedule lesson. */
export interface LessonStudentGroup {
  readonly specialityName: string;
  readonly specialityCode: string;
  readonly numberOfStudents: number;
  readonly name: string;
  readonly educationDegree: number;
}

/**
 * One lesson or exam row as returned inside IIS schedule maps.
 *
 * IIS also places announcement rows in the timetable (`announcement: true`, e.g.
 * "Последняя лекция в семестре"): they carry a `note` and a `dateLesson`, but
 * `subject`, `subjectFullName` and `lessonTypeAbbrev` are `null`, and `auditories`
 * is `null` when no room is attached.
 */
export interface ScheduleItem {
  readonly weekNumber: readonly number[] | null;
  readonly studentGroups: readonly LessonStudentGroup[];
  readonly numSubgroup: number;
  /**
   * Room names; `null` on announcement rows without a room. {@link normalizeSchedule}
   * turns `null` into `[]` (see {@link FlattenedScheduleItem.auditories}).
   */
  readonly auditories: readonly string[] | null;
  readonly startLessonTime: string;
  readonly endLessonTime: string;
  /** Short subject name; `null` on announcement rows (`announcement: true`). */
  readonly subject: Maybe<string>;
  /** Full subject name; `null` on announcement rows (`announcement: true`). */
  readonly subjectFullName: Maybe<string>;
  readonly note: Maybe<string>;
  readonly lessonTypeAbbrev: Maybe<string>;
  readonly dateLesson: Maybe<string>;
  readonly startLessonDate: Maybe<string>;
  readonly endLessonDate: Maybe<string>;
  readonly announcement: boolean;
  readonly split: boolean;
  readonly employees: Maybe<readonly Employee[]>;
}

/** Weekday → lessons map used by `schedules` / `nextSchedules`. */
export type WeekScheduleMap = Readonly<Partial<Record<Weekday, readonly ScheduleItem[]>>>;

/** Raw IIS schedule envelope for a group or employee. */
export interface ScheduleResponse {
  readonly employeeDto: Maybe<Employee>;
  readonly studentGroupDto: Maybe<StudentGroupCatalogItem>;
  readonly schedules: WeekScheduleMap | null;
  /** Additional schedules, e.g. for the next term. Shape not yet stable. */
  readonly nextSchedules?: WeekScheduleMap | null;
  readonly exams: readonly ScheduleItem[] | null;
  readonly startDate: Maybe<string>;
  readonly endDate: Maybe<string>;
  readonly startExamsDate: Maybe<string>;
  readonly endExamsDate: Maybe<string>;
  /** Current academic term identifier. Shape not yet stable. */
  readonly currentTerm?: unknown;
  /** Next academic term identifier. Shape not yet stable. */
  readonly nextTerm?: unknown;
  /** Current period within the term. Shape not yet stable. */
  readonly currentPeriod?: unknown;
  /** Whether the group follows a zaochnik or distance learning schedule. */
  readonly isZaochOrDist?: boolean | null;
}

/** Where a flattened lesson came from in the IIS schedule envelope. */
export type FlattenedScheduleSource = "schedules" | "exams" | "nextSchedules";

/** Schedule lesson with weekday / source metadata added by {@link normalizeSchedule}. */
export interface FlattenedScheduleItem extends ScheduleItem {
  /** Always an array after normalization (`null` in the raw payload becomes `[]`). */
  readonly auditories: readonly string[];
  readonly day: Weekday | null;
  readonly source: FlattenedScheduleSource;
}

/** Lessons grouped by BSUIR weekday after normalization. */
export type FlattenedLessonsByDay = Readonly<Record<Weekday, readonly FlattenedScheduleItem[]>>;

/** Criteria for {@link filterLessons} and the `filter` option of `schedule.get` / `normalizeSchedule`. */
export interface ScheduleFilterOptions {
  source?: FlattenedScheduleSource;
  weekday?: Weekday;
  /**
   * Positive week number. Matches lessons whose `weekNumber` list contains it, plus
   * weekly timetable rows with a `null` / empty `weekNumber` (they run every week,
   * as in `getLessonsForDate`). Exams and rows pinned to a `dateLesson` match only an
   * explicit list.
   */
  weekNumber?: number;
  /**
   * Positive subgroup number (1 or 2 on typical IIS payloads).
   *
   * Lessons with `numSubgroup === 0` are shared across subgroups and always
   * match when this filter is set. Passing `0` or a negative value is rejected.
   */
  subgroup?: number;
  /** One abbreviation or a list (`"ЛК"`, `["ЛК", "ПЗ"]`). An empty list does not filter. */
  lessonTypeAbbrev?: string | readonly string[];
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
  /** Endpoint label used in structural / full validation errors. */
  endpoint?: string;
  /**
   * When `true`, flatten `nextSchedules` into `lessons` / `lessonsByDay` with
   * `source: "nextSchedules"`. Default (`undefined`) keeps current-term
   * (`schedules`) only, except when `schedules` has no lessons — then the next
   * term is flattened so between-term IIS payloads are not empty.
   * Pass `false` to never flatten `nextSchedules`.
   */
  includeNextSchedules?: boolean;
  /**
   * Narrows **every** view of the result (`lessons`, `lessonsByDay`, `scheduleLessons`,
   * `examLessons` and the `schedules` / `exams` / `nextSchedules` maps) to lessons
   * matching these criteria — e.g. `{ subgroup: 2 }` yields a complete schedule of one
   * subgroup (shared `numSubgroup: 0` lessons included) for the date helpers. The
   * `includeNextSchedules` fallback is decided on the unfiltered timetable.
   */
  filter?: ScheduleFilterOptions;
}

/**
 * Normalized schedule payload: cloned maps plus flattened `lessons` views.
 * Default flatten covers current-term `schedules` and `exams`; `nextSchedules`
 * is included when current-term `schedules` has no lessons, or when opted in.
 *
 * Deep-frozen at runtime; the `readonly` types reflect that.
 */
export interface NormalizedScheduleResponse extends Omit<ScheduleResponse, "schedules" | "exams"> {
  readonly schedules: WeekScheduleMap;
  readonly exams: readonly ScheduleItem[];
  readonly lessons: readonly FlattenedScheduleItem[];
  readonly lessonsByDay: FlattenedLessonsByDay;
  readonly scheduleLessons: readonly FlattenedScheduleItem[];
  readonly examLessons: readonly FlattenedScheduleItem[];
}

/**
 * Minimal time fields required for lesson-time helpers.
 * Used as a constraint for generic helpers like {@link sortLessonsByTime}.
 */
export type LessonWithTime = Pick<FlattenedScheduleItem, "startLessonTime" | "endLessonTime">;

/** Time-zone option shared by date/time schedule helpers. */
export interface ScheduleTimeZoneOptions {
  /**
   * IANA time zone in which `Date` instants are read as calendar dates and wall-clock
   * times. BSUIR lesson times are Minsk times, so the default stays correct on servers
   * running in UTC. Pass `Intl.DateTimeFormat().resolvedOptions().timeZone` to use the
   * runtime's local zone instead.
   *
   * @defaultValue "Europe/Minsk"
   */
  timeZone?: string | undefined;
}

/** Study-week options for date-based schedule helpers. */
export interface StudyWeekOptions extends ScheduleTimeZoneOptions {
  /**
   * Authoritative study week (1–4) at `now`, e.g. from `client.schedule.getCurrentWeek()`.
   * When set, the week of any other date in the same academic year is counted from it
   * (weeks change on Mondays). Dates in another academic year use the calendar, because
   * the cycle restarts at week 1 every September.
   *
   * Without it the week comes from the BSUIR academic calendar: week 1 is the
   * Monday–Sunday week containing 1 September, and the 4-week cycle runs through the
   * whole academic year. Ignored for schedules whose `weekNumber` values exceed 4.
   */
  currentWeek?: number | undefined;
  /** Moment at which `currentWeek` is valid. Defaults to `new Date()`. */
  now?: Date | undefined;
}

/**
 * Options for {@link buildScheduleDays}.
 */
export interface BuildScheduleDaysOptions extends StudyWeekOptions {
  /**
   * Reference moment for "today", current/next lesson detection and `currentWeek`.
   * Defaults to `new Date()`.
   */
  now?: Date;
  /** First day of the range (its calendar date in `timeZone`). Defaults to `now`. */
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
   * Callback fired once per lesson and malformed field (`startLessonTime` /
   * `endLessonTime` that cannot be parsed as `HH:MM`) found on any day of the range —
   * a weekly lesson repeated on several days is reported once. The lesson is otherwise
   * still included in the day's `lessons` array but sorted to the end. Use this to
   * surface upstream data issues that would otherwise be silently ignored.
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
  /**
   * Start of this calendar day (00:00) in `timeZone`. With the default Minsk zone this is
   * local midnight for users in Belarus; elsewhere prefer `dateKey`, or format with
   * `{ timeZone: "Europe/Minsk" }`.
   */
  date: Date;
  /** ISO-style date key in `"YYYY-MM-DD"` format for fast equality checks. */
  dateKey: string;
  /** BSUIR weekday name, or `null` for Sunday. */
  weekday: Weekday | null;
  /** Display label: weekday name, or `"Воскресенье"` for Sunday. */
  weekdayLabel: string;
  /**
   * Week number used to pick this day's lessons: the study week (1–4), or an absolute
   * week for schedules numbering weeks beyond 4; `null` when it cannot be determined.
   */
  weekNumber: number | null;
  /** Lessons for this day sorted by start time. */
  lessons: FlattenedScheduleItem[];
  /** Whether this day is the calendar date of `now` in `timeZone`. */
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
