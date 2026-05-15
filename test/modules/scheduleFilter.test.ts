import { describe, expect, it } from "vitest";
import { filterLessons } from "../../src/modules/scheduleFilter";
import { normalizeSchedule } from "../../src/modules/scheduleNormalize";
import type { ScheduleItem, ScheduleResponse } from "../../src/types/schedule";

function makeItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    weekNumber: [1, 2],
    studentGroups: [],
    numSubgroup: 0,
    auditories: ["101-2"],
    startLessonTime: "09:00",
    endLessonTime: "10:20",
    subject: "Математика",
    subjectFullName: "Математический анализ",
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

function buildSchedule(items: ScheduleItem[]): ReturnType<typeof normalizeSchedule> {
  const payload: ScheduleResponse = {
    employeeDto: null,
    studentGroupDto: null,
    schedules: { Понедельник: items },
    exams: [],
    startDate: null,
    endDate: null,
    startExamsDate: null,
    endExamsDate: null,
  };
  return normalizeSchedule(payload);
}

describe("filterLessons", () => {
  it("returns all lessons when filter is empty", () => {
    const schedule = buildSchedule([makeItem(), makeItem({ subject: "Физика" })]);
    expect(filterLessons(schedule, {})).toHaveLength(2);
  });

  it("filters by source", () => {
    const schedule = buildSchedule([makeItem()]);
    expect(filterLessons(schedule, { source: "schedules" })).toHaveLength(1);
    expect(filterLessons(schedule, { source: "exams" })).toHaveLength(0);
  });

  it("filters by weekday", () => {
    const schedule = buildSchedule([makeItem()]);
    expect(filterLessons(schedule, { weekday: "Понедельник" })).toHaveLength(1);
    expect(filterLessons(schedule, { weekday: "Вторник" })).toHaveLength(0);
  });

  it("filters by weekNumber", () => {
    const schedule = buildSchedule([makeItem({ weekNumber: [1, 3] })]);
    expect(filterLessons(schedule, { weekNumber: 1 })).toHaveLength(1);
    expect(filterLessons(schedule, { weekNumber: 2 })).toHaveLength(0);
  });

  it("filters by subgroup", () => {
    const schedule = buildSchedule([makeItem({ numSubgroup: 1 }), makeItem({ numSubgroup: 2 })]);
    expect(filterLessons(schedule, { subgroup: 1 })).toHaveLength(1);
    expect(filterLessons(schedule, { subgroup: 0 })).toHaveLength(0);
  });

  it("filters by lessonTypeAbbrev string", () => {
    const schedule = buildSchedule([makeItem({ lessonTypeAbbrev: "ЛК" }), makeItem({ lessonTypeAbbrev: "ПЗ" })]);
    expect(filterLessons(schedule, { lessonTypeAbbrev: "ЛК" })).toHaveLength(1);
  });

  it("filters by lessonTypeAbbrev array", () => {
    const schedule = buildSchedule([
      makeItem({ lessonTypeAbbrev: "ЛК" }),
      makeItem({ lessonTypeAbbrev: "ПЗ" }),
      makeItem({ lessonTypeAbbrev: "ЛР" }),
    ]);
    expect(filterLessons(schedule, { lessonTypeAbbrev: ["ЛК", "ЛР"] })).toHaveLength(2);
  });

  it("filters by lessonTypeAbbrev — skips lesson with null abbreviation", () => {
    const schedule = buildSchedule([makeItem({ lessonTypeAbbrev: null })]);
    expect(filterLessons(schedule, { lessonTypeAbbrev: "ЛК" })).toHaveLength(0);
  });

  it("filters by subjectQuery matching subject", () => {
    const schedule = buildSchedule([makeItem(), makeItem({ subject: "Физика" })]);
    expect(filterLessons(schedule, { subjectQuery: "физика" })).toHaveLength(1);
  });

  it("filters by subjectQuery matching note", () => {
    const schedule = buildSchedule([makeItem({ note: "контрольная" }), makeItem()]);
    expect(filterLessons(schedule, { subjectQuery: "контрольная" })).toHaveLength(1);
  });

  it("filters by employeeUrlId", () => {
    const employee = {
      id: 1,
      urlId: "ivanov",
      calendarId: "cal",
      firstName: "Иван",
      lastName: "Иванов",
      middleName: "Иванович",
      degree: "доц.",
      email: null,
      rank: null,
      photoLink: "",
      jobPositions: null,
    };
    const schedule = buildSchedule([
      makeItem({ employees: [employee] }),
      makeItem({ employees: null }),
    ]);
    expect(filterLessons(schedule, { employeeUrlId: "ivanov" })).toHaveLength(1);
    expect(filterLessons(schedule, { employeeUrlId: "petrov" })).toHaveLength(0);
  });

  it("filters by employeeUrlId — returns nothing when employees is null", () => {
    const schedule = buildSchedule([makeItem({ employees: null })]);
    expect(filterLessons(schedule, { employeeUrlId: "anyone" })).toHaveLength(0);
  });

  it("filters by auditory", () => {
    const schedule = buildSchedule([
      makeItem({ auditories: ["101-2"] }),
      makeItem({ auditories: ["202-4"] }),
    ]);
    expect(filterLessons(schedule, { auditory: "101-2" })).toHaveLength(1);
    expect(filterLessons(schedule, { auditory: "999" })).toHaveLength(0);
  });

  it("throws for non-positive-integer weekNumber", () => {
    const schedule = buildSchedule([]);
    expect(() => filterLessons(schedule, { weekNumber: 0 })).toThrow();
    expect(() => filterLessons(schedule, { weekNumber: -1 })).toThrow();
  });
});
