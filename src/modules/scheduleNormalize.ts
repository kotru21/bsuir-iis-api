import { BsuirResponseValidationError } from "../client/errors";
import { assertScheduleResponse } from "../client/responseValidators";
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

// Minimal envelope check kept here (not in responseValidators) because the normalize
// path always needs at least this much shape safety to avoid crashing on a non-object
// payload — even when full validation is disabled. The full validator
// `assertScheduleResponse` is the single source of truth for the complete check.
function assertMinimalScheduleEnvelope(
  payload: unknown,
  endpoint: string
): asserts payload is { schedules?: unknown; exams?: unknown } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new BsuirResponseValidationError(
      `Invalid response payload for ${endpoint}: expected object`,
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
  const endpoint = options?.endpoint ?? "/schedule";
  if (options?.validate) {
    // Full envelope validation via the single source of truth.
    assertScheduleResponse(response, endpoint);
  } else {
    // Even without full validation, refuse to normalize a non-object payload —
    // letting it through would only push a less-clear TypeError onto the caller.
    assertMinimalScheduleEnvelope(response, endpoint);
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

    const flattenedDayItems: FlattenedScheduleItem[] = clonedDayItems.map((item) => ({
      ...item,
      day,
      source: "schedules" as const
    }));
    lessonsByDay[day] = flattenedDayItems;
    scheduleLessons.push(...flattenedDayItems);
  }

  for (const exam of normalizedExams) {
    const flattenedExam: FlattenedScheduleItem = {
      ...exam,
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
