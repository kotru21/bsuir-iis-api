import { describe, expect, it } from "vitest";
import {
  buildScheduleDays,
  getCurrentLesson,
  getLessonsForDate,
  getLessonsForWeek,
  getNextLesson,
  getTodayLessons,
  getTomorrowLessons,
  groupLessonsByDay,
  normalizeSchedule,
  sortLessonsByTime,
} from "../../src";
import type { ScheduleItem, ScheduleResponse } from "../../src/types/schedule";

function makeLesson(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    weekNumber: [1],
    studentGroups: [],
    numSubgroup: 0,
    auditories: [],
    startLessonTime: "09:00",
    endLessonTime: "10:20",
    subject: "Предмет",
    subjectFullName: "Предмет (полное название)",
    note: null,
    lessonTypeAbbrev: "ЛК",
    dateLesson: null,
    startLessonDate: null,
    endLessonDate: null,
    announcement: false,
    split: false,
    employees: null,
    ...overrides,
  };
}

function buildNormalizedSchedule() {
  const payload: ScheduleResponse = {
    employeeDto: null,
    studentGroupDto: null,
    schedules: {
      Понедельник: [
        makeLesson({
          subject: "Пара 2",
          startLessonTime: "11:00",
          endLessonTime: "12:20",
          weekNumber: [1],
          startLessonDate: "12.05.2025",
          endLessonDate: "30.06.2025",
        }),
        makeLesson({
          subject: "Пара 1",
          startLessonTime: "09:00",
          endLessonTime: "10:20",
          weekNumber: [1],
          startLessonDate: "12.05.2025",
          endLessonDate: "30.06.2025",
        }),
        makeLesson({
          subject: "Пара недели 2",
          startLessonTime: "13:00",
          endLessonTime: "14:20",
          weekNumber: [2],
          startLessonDate: "12.05.2025",
          endLessonDate: "30.06.2025",
        }),
      ],
      Вторник: [
        makeLesson({
          subject: "Пара вторника",
          startLessonTime: "08:30",
          endLessonTime: "09:50",
          weekNumber: [1, 2],
          startLessonDate: "12.05.2025",
          endLessonDate: "30.06.2025",
        }),
      ],
    },
    exams: [
      makeLesson({
        subject: "Экзамен",
        startLessonTime: "15:00",
        endLessonTime: "16:00",
        weekNumber: [1],
        dateLesson: "13.05.2025",
      }),
    ],
    startDate: "12.05.2025",
    endDate: "30.06.2025",
    startExamsDate: "13.05.2025",
    endExamsDate: "20.06.2025",
  };

  return normalizeSchedule(payload);
}

describe("schedule helpers", () => {
  it("returns lessons for date with inferred week filter and sorted order", () => {
    const schedule = buildNormalizedSchedule();

    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12, 12, 0));
    expect(lessons.map((item) => item.subject)).toEqual(["Пара 1", "Пара 2"]);
  });

  it("returns lessons for today and tomorrow", () => {
    const schedule = buildNormalizedSchedule();
    const now = new Date(2025, 4, 12, 9, 30);

    const today = getTodayLessons(schedule, now);
    const tomorrow = getTomorrowLessons(schedule, now);

    expect(today.map((item) => item.subject)).toEqual(["Пара 1", "Пара 2"]);
    expect(tomorrow.map((item) => item.subject)).toEqual(["Пара вторника", "Экзамен"]);
  });

  it("filters schedule lessons by week", () => {
    const schedule = buildNormalizedSchedule();

    const weekTwoLessons = getLessonsForWeek(schedule, 2);
    expect(weekTwoLessons.map((item) => item.subject)).toEqual(["Пара вторника", "Пара недели 2"]);
  });

  it("sorts and groups lessons by day", () => {
    const schedule = buildNormalizedSchedule();
    const mixed = [schedule.lessons[0], schedule.lessons[3], schedule.lessons[1], schedule.lessons[4]].filter(
      Boolean,
    );

    const sorted = sortLessonsByTime(mixed);
    expect(sorted.map((item) => item.subject)).toEqual(["Пара вторника", "Пара 1", "Пара 2", "Экзамен"]);

    const grouped = groupLessonsByDay(schedule.lessons);
    expect(grouped.Понедельник.map((item) => item.subject)).toEqual([
      "Пара 1",
      "Пара 2",
      "Пара недели 2",
    ]);
    expect(grouped.Вторник.map((item) => item.subject)).toEqual(["Пара вторника"]);
  });

  it("detects current and next lessons", () => {
    const lessons = [
      makeLesson({ subject: "Пара 2", startLessonTime: "11:00", endLessonTime: "12:20" }),
      makeLesson({ subject: "Пара 1", startLessonTime: "09:00", endLessonTime: "10:20" }),
    ];

    const current = getCurrentLesson(lessons, new Date(2025, 4, 12, 9, 30));
    const next = getNextLesson(lessons, new Date(2025, 4, 12, 10, 30));

    expect(current?.subject).toBe("Пара 1");
    expect(next?.subject).toBe("Пара 2");
  });

  it("builds schedule day models and supports empty-day filtering", () => {
    const schedule = buildNormalizedSchedule();
    const now = new Date(2025, 4, 12, 9, 30);

    const days = buildScheduleDays(schedule, {
      now,
      startDate: new Date(2025, 4, 12),
      days: 3,
    });

    expect(days).toHaveLength(3);
    expect(days[0]?.isToday).toBe(true);
    expect(days[0]?.hasLessons).toBe(true);
    expect(days[0]?.currentLesson?.subject).toBe("Пара 1");
    expect(days[0]?.nextLesson?.subject).toBe("Пара 2");
    expect(days[2]?.hasLessons).toBe(false);

    const nonEmptyDays = buildScheduleDays(schedule, {
      startDate: new Date(2025, 4, 12),
      days: 3,
      includeEmptyDays: false,
    });
    expect(nonEmptyDays).toHaveLength(2);
  });

  it("stays stable for empty schedules and invalid times", () => {
    const empty = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: null,
      exams: [],
      startDate: null,
      endDate: null,
      startExamsDate: null,
      endExamsDate: null,
    });

    expect(getLessonsForDate(empty, new Date(2025, 4, 11))).toEqual([]);
    expect(buildScheduleDays(empty, { days: 2, includeEmptyDays: false })).toEqual([]);

    const invalidTimeLesson = makeLesson({ startLessonTime: "invalid" });
    expect(getCurrentLesson([invalidTimeLesson], new Date(2025, 4, 12, 9, 0))).toBeNull();
    expect(getNextLesson([invalidTimeLesson], new Date(2025, 4, 12, 9, 0))).toBeNull();
  });
});
