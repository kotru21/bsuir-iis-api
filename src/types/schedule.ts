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
  weekNumber: number[];
  studentGroups: LessonStudentGroup[];
  numSubgroup: number;
  auditories: string[];
  startLessonTime: string;
  endLessonTime: string;
  subject: string;
  subjectFullName: string;
  note: Maybe<string>;
  lessonTypeAbbrev: string;
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
  schedules: WeekScheduleMap;
  exams: ScheduleItem[];
  startDate: Maybe<string>;
  endDate: Maybe<string>;
  startExamsDate: Maybe<string>;
  endExamsDate: Maybe<string>;
}

export interface FlattenedScheduleItem extends ScheduleItem {
  day: Weekday | null;
  source: "schedules" | "exams";
}

export type FlattenedLessonsByDay = Partial<Record<Weekday, FlattenedScheduleItem[]>>;

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

export interface NormalizedScheduleResponse extends Omit<ScheduleResponse, "schedules" | "exams"> {
  schedules: WeekScheduleMap;
  exams: ScheduleItem[];
  lessons: FlattenedScheduleItem[];
  lessonsByDay: FlattenedLessonsByDay;
  scheduleLessons: FlattenedScheduleItem[];
  examLessons: FlattenedScheduleItem[];
}
