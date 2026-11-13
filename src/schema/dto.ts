import { BsuirResponseValidationError } from "../client/errors";
import type { Announcement } from "../types/announcement";
import type {
  Auditory,
  AuditoryDepartment,
  AuditoryType,
  BuildingNumber,
  Department,
  EducationForm,
  Faculty,
  Speciality,
  StudentGroupCatalogItem
} from "../types/catalog";
import { isWeekday, WEEKDAYS, type StudentGroupShort } from "../types/common";
import type { Employee, EmployeeCatalogItem } from "../types/employee";
import type {
  LessonStudentGroup,
  ScheduleItem,
  ScheduleResponse,
  WeekScheduleMap
} from "../types/schedule";
import {
  array,
  asRecord,
  boolean,
  failField,
  nullable,
  number,
  object,
  optional,
  string,
  union,
  unknown,
  type Schema
} from "./core";

/*
 * One schema per public DTO, each checked against its interface by `object<T>()`.
 * Strict mode (`validateResponses` / `createBsuirClient.strict()`) validates payloads
 * with these; the always-on structural guards live in `client/responseValidators`.
 */

export const studentGroupShortSchema: Schema<StudentGroupShort> = object<StudentGroupShort>({
  id: number(),
  name: string()
});

export const employeeSchema: Schema<Employee> = object<Employee>({
  firstName: string(),
  lastName: string(),
  middleName: nullable(string()),
  degree: string(),
  degreeAbbrev: optional(string()),
  email: nullable(string()),
  rank: nullable(string()),
  photoLink: string(),
  calendarId: string(),
  id: number(),
  urlId: string(),
  jobPositions: nullable(array(string()))
});

export const employeeCatalogItemSchema: Schema<EmployeeCatalogItem> = object<EmployeeCatalogItem>({
  firstName: string(),
  lastName: string(),
  middleName: nullable(string()),
  degree: string(),
  rank: nullable(string()),
  photoLink: string(),
  calendarId: string(),
  academicDepartment: optional(array(string())),
  id: number(),
  urlId: string(),
  fio: string()
});

export const facultySchema: Schema<Faculty> = object<Faculty>({
  id: number(),
  name: string(),
  abbrev: string()
});

export const departmentSchema: Schema<Department> = object<Department>({
  id: number(),
  name: string(),
  abbrev: string(),
  urlId: string()
});

const educationFormSchema = object<EducationForm>({
  id: number(),
  name: string()
});

export const specialitySchema: Schema<Speciality> = object<Speciality>({
  id: number(),
  name: string(),
  abbrev: string(),
  educationForm: union(educationFormSchema, array(educationFormSchema)),
  facultyId: number(),
  code: string()
});

export const studentGroupCatalogItemSchema: Schema<StudentGroupCatalogItem> =
  object<StudentGroupCatalogItem>({
    name: string(),
    facultyId: number(),
    facultyName: optional(string()),
    facultyAbbrev: optional(string()),
    specialityDepartmentEducationFormId: number(),
    specialityName: string(),
    specialityAbbrev: optional(string()),
    course: nullable(number()),
    id: number(),
    calendarId: string(),
    educationDegree: optional(number())
  });

const auditoryTypeSchema = object<AuditoryType>({
  id: number(),
  name: string(),
  abbrev: string()
});

const buildingNumberSchema = object<BuildingNumber>({
  id: number(),
  name: string()
});

const auditoryDepartmentSchema = object<AuditoryDepartment>({
  idDepartment: number(),
  abbrev: string(),
  name: string(),
  nameAndAbbrev: string()
});

export const auditorySchema: Schema<Auditory> = object<Auditory>({
  id: number(),
  name: string(),
  note: nullable(string()),
  capacity: nullable(number()),
  auditoryType: auditoryTypeSchema,
  buildingNumber: buildingNumberSchema,
  department: nullable(auditoryDepartmentSchema)
});

export const announcementSchema: Schema<Announcement> = object<Announcement>({
  id: number(),
  employee: string(),
  content: string(),
  date: string(),
  employeeDepartments: array(string()),
  studentGroups: array(studentGroupShortSchema)
});

const lessonStudentGroupSchema = object<LessonStudentGroup>({
  specialityName: string(),
  specialityCode: string(),
  numberOfStudents: number(),
  name: string(),
  educationDegree: number()
});

export const scheduleItemSchema: Schema<ScheduleItem> = object<ScheduleItem>({
  weekNumber: nullable(array(number())),
  studentGroups: array(lessonStudentGroupSchema),
  numSubgroup: number(),
  // Announcement rows without a room carry `auditories: null` on live IIS payloads.
  auditories: nullable(array(string())),
  startLessonTime: string(),
  endLessonTime: string(),
  // Announcement rows (`announcement: true`) carry `subject: null` on live IIS payloads.
  subject: nullable(string()),
  subjectFullName: nullable(string()),
  note: nullable(string()),
  lessonTypeAbbrev: nullable(string()),
  dateLesson: nullable(string()),
  startLessonDate: nullable(string()),
  endLessonDate: nullable(string()),
  announcement: boolean(),
  split: boolean(),
  employees: nullable(array(employeeSchema))
});

/**
 * Weekday → lessons map. Nullish day buckets are empty (sparse payloads); lessons
 * under a key other than {@link WEEKDAYS} (e.g. "Воскресенье") are rejected because
 * normalization cannot place them into the flattened weekday views.
 */
function weekScheduleMap(item: Schema<ScheduleItem>): Schema<WeekScheduleMap> {
  return {
    expected: "an object",
    isShape: (value) => asRecord(value) !== null,
    check(value, location, endpoint) {
      const record = asRecord(value);
      if (!record) {
        failField(endpoint, location, "an object", value);
      }
      for (const [day, dayItems] of Object.entries(record)) {
        if (dayItems === undefined || dayItems === null) {
          continue;
        }
        const dayLocation = `${location}.${day}`;
        if (!Array.isArray(dayItems)) {
          failField(endpoint, dayLocation, "an array of lessons", dayItems);
        }
        if (!isWeekday(day) && dayItems.length > 0) {
          throw new BsuirResponseValidationError(
            `Invalid response payload for ${endpoint}: '${dayLocation}' is not a known weekday key ` +
              `(expected one of ${WEEKDAYS.join(", ")}); its ${String(dayItems.length)} lesson(s) ` +
              "would be missing from normalized lesson views",
            endpoint
          );
        }
        for (const [index, lesson] of dayItems.entries()) {
          item.check(lesson, `${dayLocation}[${String(index)}]`, endpoint);
        }
      }
    }
  };
}

const weekScheduleMapSchema = weekScheduleMap(scheduleItemSchema);

export const scheduleResponseSchema: Schema<ScheduleResponse> = object<ScheduleResponse>({
  employeeDto: nullable(employeeSchema),
  studentGroupDto: nullable(studentGroupCatalogItemSchema),
  schedules: nullable(weekScheduleMapSchema),
  nextSchedules: optional(nullable(weekScheduleMapSchema)),
  exams: nullable(array(scheduleItemSchema)),
  startDate: nullable(string()),
  endDate: nullable(string()),
  startExamsDate: nullable(string()),
  endExamsDate: nullable(string()),
  currentTerm: optional(unknown()),
  nextTerm: optional(unknown()),
  currentPeriod: optional(unknown()),
  isZaochOrDist: optional(nullable(boolean()))
});
