import { BsuirResponseValidationError } from "../client/errors";
import { WEEKDAYS } from "../types/common";
import type {
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  LessonStudentGroup,
  NormalizedScheduleResponse,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";

function lessonAuditories(item: ScheduleItem): string[] {
  const { auditories } = item;
  return Array.isArray(auditories) ? [...auditories] : [];
}

function cloneLessonStudentGroups(groups: ScheduleItem["studentGroups"]): LessonStudentGroup[] {
  return groups.map((group) => ({ ...group }));
}

function cloneEmployees(employees: ScheduleItem["employees"]): ScheduleItem["employees"] {
  if (!Array.isArray(employees)) {
    return employees;
  }
  return employees.map((employee) => ({ ...employee }));
}

function cloneScheduleItem(item: ScheduleItem): ScheduleItem {
  return {
    ...item,
    weekNumber: Array.isArray(item.weekNumber) ? [...item.weekNumber] : item.weekNumber,
    studentGroups: cloneLessonStudentGroups(item.studentGroups),
    auditories: lessonAuditories(item),
    employees: cloneEmployees(item.employees)
  };
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function isNullableObject(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === "object" && !Array.isArray(value))
  );
}

function assertScheduleEnvelope(payload: unknown, endpoint: string): void {
  const record = asRecord(payload);
  if (!record) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected object`,
      endpoint
    );
  }

  const schedules = record.schedules;
  const exams = record.exams;
  const employeeDto = record.employeeDto;
  const studentGroupDto = record.studentGroupDto;

  if (
    schedules !== null &&
    schedules !== undefined &&
    (typeof schedules !== "object" || Array.isArray(schedules))
  ) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'schedules' must be object or null`,
      endpoint
    );
  }

  if (exams !== null && exams !== undefined && !Array.isArray(exams)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'exams' must be array or null`,
      endpoint
    );
  }

  if (!isNullableObject(employeeDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'employeeDto' must be object or null`,
      endpoint
    );
  }

  if (!isNullableObject(studentGroupDto)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: 'studentGroupDto' must be object or null`,
      endpoint
    );
  }
}

/**
 * Transforms raw schedule response into normalized structure with flattened lessons.
 */
export function normalizeSchedule(
  response: ScheduleResponse,
  options?: { validate?: boolean; endpoint?: string }
): NormalizedScheduleResponse {
  if (options?.validate) {
    assertScheduleEnvelope(response, options.endpoint ?? "/schedule");
  }
  const scheduleLessons: FlattenedScheduleItem[] = [];
  const examLessons: FlattenedScheduleItem[] = [];
  const lessonsByDay = Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as FlattenedLessonsByDay;
  const sourceSchedules = response.schedules ?? {};
  const normalizedSchedules: NonNullable<ScheduleResponse["schedules"]> = {};
  const normalizedExams = Array.isArray(response.exams)
    ? response.exams.map((item) => cloneScheduleItem(item))
    : [];

  for (const day of WEEKDAYS) {
    const dayItems = sourceSchedules[day] ?? [];
    const clonedDayItems = dayItems.map((item) => cloneScheduleItem(item));
    if (Object.hasOwn(sourceSchedules, day)) {
      normalizedSchedules[day] = clonedDayItems;
    }

    const flattenedDayItems = clonedDayItems.map((item) => ({
      ...cloneScheduleItem(item),
      day,
      source: "schedules" as const
    }));
    lessonsByDay[day] = flattenedDayItems;
    scheduleLessons.push(...flattenedDayItems);
  }

  for (const exam of normalizedExams) {
    const flattenedExam: FlattenedScheduleItem = {
      ...cloneScheduleItem(exam),
      day: null,
      source: "exams"
    };
    examLessons.push(flattenedExam);
  }

  const lessons = [...scheduleLessons, ...examLessons];

  return {
    ...response,
    schedules: normalizedSchedules,
    exams: normalizedExams,
    lessons,
    lessonsByDay,
    scheduleLessons,
    examLessons
  };
}
