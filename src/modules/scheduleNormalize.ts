import type { Weekday } from "../types/common";
import type {
  FlattenedLessonsByDay,
  FlattenedScheduleItem,
  NormalizedScheduleResponse,
  ScheduleItem,
  ScheduleResponse
} from "../types/schedule";

const WEEKDAYS: Weekday[] = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

function lessonAuditories(item: ScheduleItem): string[] {
  const { auditories } = item;
  return Array.isArray(auditories) ? auditories : [];
}

/**
 * Transforms raw schedule response into normalized structure with flattened lessons.
 */
export function normalizeSchedule(response: ScheduleResponse): NormalizedScheduleResponse {
  const lessons: FlattenedScheduleItem[] = [];
  const scheduleLessons: FlattenedScheduleItem[] = [];
  const examLessons: FlattenedScheduleItem[] = [];
  const lessonsByDay = Object.fromEntries(
    WEEKDAYS.map((day) => [day, [] as FlattenedScheduleItem[]])
  ) as FlattenedLessonsByDay;
  const safeSchedules = response.schedules ?? {};
  const safeExams = response.exams ?? [];

  for (const day of WEEKDAYS) {
    const dayItems = safeSchedules[day] ?? [];
    const flattenedDayItems = dayItems.map((item) => {
      const auditories = lessonAuditories(item);
      return {
        ...item,
        auditories,
        day,
        source: "schedules" as const
      };
    });
    lessonsByDay[day] = flattenedDayItems;
    lessons.push(...flattenedDayItems);
    scheduleLessons.push(...flattenedDayItems);
  }

  for (const exam of safeExams) {
    const auditories = lessonAuditories(exam);
    const flattenedExam: FlattenedScheduleItem = {
      ...exam,
      auditories,
      day: null,
      source: "exams"
    };
    lessons.push(flattenedExam);
    examLessons.push(flattenedExam);
  }

  return {
    ...response,
    schedules: safeSchedules,
    exams: safeExams,
    lessons,
    lessonsByDay,
    scheduleLessons,
    examLessons
  };
}
