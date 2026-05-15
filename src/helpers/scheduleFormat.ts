import type { Employee } from "../types/employee";
import type { FlattenedScheduleItem } from "../types/schedule";

/**
 * Formats lesson start and end time as a range string.
 *
 * @returns `"HH:MM–HH:MM"`, or an empty string when both times are missing.
 *
 * @example
 * ```ts
 * formatLessonTimeRange(lesson); // "10:00–11:30"
 * ```
 */
export function formatLessonTimeRange(
  lesson: Pick<FlattenedScheduleItem, "startLessonTime" | "endLessonTime">,
): string {
  const start = lesson.startLessonTime.trim();
  const end = lesson.endLessonTime.trim();
  if (start && end) return `${start}\u2013${end}`;
  if (start) return start;
  if (end) return end;
  return "";
}

/**
 * Returns the lesson type abbreviation.
 *
 * @returns The abbreviation string (e.g. `"ЛК"`, `"ПЗ"`, `"ЛР"`),
 * or an empty string when the field is absent.
 *
 * @example
 * ```ts
 * formatLessonType(lesson); // "ЛК"
 * ```
 */
export function formatLessonType(
  lesson: Pick<FlattenedScheduleItem, "lessonTypeAbbrev">,
): string {
  return lesson.lessonTypeAbbrev?.trim() ?? "";
}

/**
 * Returns a human-readable subgroup label.
 *
 * @returns `"1 подгруппа"` / `"2 подгруппа"` etc., or `""` when `numSubgroup` is 0.
 *
 * @example
 * ```ts
 * formatLessonSubgroup(lesson); // "1 подгруппа"
 * ```
 */
export function formatLessonSubgroup(
  lesson: Pick<FlattenedScheduleItem, "numSubgroup">,
): string {
  if (!lesson.numSubgroup) return "";
  return `${String(lesson.numSubgroup)} \u043F\u043E\u0434\u0433\u0440\u0443\u043F\u043F\u0430`;
}

/**
 * Formats the week numbers list as a compact string.
 *
 * Returns `"кажд. нед."` when `weekNumber` is `null` or empty.
 * Returns `"1, 3 нед."` for a specific set of weeks.
 *
 * @example
 * ```ts
 * formatLessonWeekNumbers({ weekNumber: [1, 3] }); // "1, 3 нед."
 * formatLessonWeekNumbers({ weekNumber: null });    // "кажд. нед."
 * ```
 */
export function formatLessonWeekNumbers(
  lesson: Pick<FlattenedScheduleItem, "weekNumber">,
): string {
  if (!lesson.weekNumber || lesson.weekNumber.length === 0) {
    return "\u043A\u0430\u0436\u0434. \u043D\u0435\u0434.";
  }
  return `${lesson.weekNumber.join(", ")} \u043D\u0435\u0434.`;
}

/**
 * Formats a list of auditories as a comma-separated string.
 *
 * @returns `"101-2, 102-3"` or `""` when the list is empty.
 *
 * @example
 * ```ts
 * formatLessonAuditories(lesson); // "101-2, 102-3"
 * ```
 */
export function formatLessonAuditories(
  lesson: Pick<FlattenedScheduleItem, "auditories">,
): string {
  return lesson.auditories.join(", ");
}

/**
 * Formats an employee name as `"Фамилия И.О."`.
 *
 * Falls back gracefully when first or middle name is missing.
 *
 * @example
 * ```ts
 * formatEmployeeShortName(employee); // "Иванов И.И."
 * ```
 */
export function formatEmployeeShortName(
  employee: Pick<Employee, "lastName" | "firstName" | "middleName">,
): string {
  const lastName = employee.lastName.trim();
  const first = employee.firstName.trim();
  const middle = employee.middleName.trim();

  let initials = "";
  if (first.length > 0) initials += `${first.charAt(0)}.`;
  if (middle.length > 0) initials += `${middle.charAt(0)}.`;

  return initials.length > 0 ? `${lastName} ${initials}` : lastName;
}

/**
 * Formats all lesson employees as short names joined by `", "`.
 *
 * @returns `"Иванов И.И., Петров П.П."` or `""` when employees list is absent.
 *
 * @example
 * ```ts
 * formatLessonEmployees(lesson); // "Иванов И.И."
 * ```
 */
export function formatLessonEmployees(
  lesson: Pick<FlattenedScheduleItem, "employees">,
): string {
  if (!lesson.employees || lesson.employees.length === 0) return "";
  return lesson.employees.map(formatEmployeeShortName).join(", ");
}
