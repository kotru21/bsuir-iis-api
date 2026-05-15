import { describe, expect, it } from "vitest";
import { filterLessons } from "../../src/modules/scheduleFilter";
import { normalizeSchedule } from "../../src/modules/scheduleNormalize";
import type { ScheduleItem, ScheduleResponse } from "../../src/types/schedule";

function makeItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    weekNumber: [1],
    studentGroups: [],
    numSubgroup: 0,
    auditories: ["101-1"],
    startLessonTime: "09:00",
    endLessonTime: "10:20",
    subject: "Предмет",
    subjectFullName: "Предмет полное",
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

function makeSchedule(overrides: Partial<ScheduleResponse> = {}) {
  return normalizeSchedule({
    employeeDto: null,
    studentGroupDto: null,
    schedules: { Понедельник: [makeItem()] },
    exams: [],
    startDate: null,
    endDate: null,
    startExamsDate: null,
    endExamsDate: null,
    ...overrides,
  });
}

describe("scheduleFilter", () => {
  it("returns all lessons when filter is empty", () => {
    const schedule = makeSchedule();
    expect(filterLessons(schedule, {})).toHaveLength(1);
  });

  it("filters by source", () => {
    const schedule = makeSchedule({ exams: [makeItem({ dateLesson: "12.06.2025" })] });
    expect(filterLessons(schedule, { source: "exams" })).toHaveLength(1);
    expect(filterLessons(schedule, { source: "schedules" })).toHaveLength(1);
  });

  it("filters by weekday", () => {
    const schedule = makeSchedule();
    expect(filterLessons(schedule, { weekday: "Понедельник" })).toHaveLength(1);
    expect(filterLessons(schedule, { weekday: "Вторник" })).toHaveLength(0);
  });

  it("filters by weekNumber", () => {
    const schedule = makeSchedule();
    expect(filterLessons(schedule, { weekNumber: 1 })).toHaveLength(1);
    expect(filterLessons(schedule, { weekNumber: 2 })).toHaveLength(0);
  });

  it("filters by subgroup", () => {
    const schedule = makeSchedule();
    expect(filterLessons(schedule, { subgroup: 0 })).toHaveLength(1);
    expect(filterLessons(schedule, { subgroup: 1 })).toHaveLength(0);
  });

  it("filters by lessonTypeAbbrev string", () => {
    expect(filterLessons(makeSchedule(), { lessonTypeAbbrev: "ЛК" })).toHaveLength(1);
    expect(filterLessons(makeSchedule(), { lessonTypeAbbrev: "ЛР" })).toHaveLength(0);
  });

  it("filters by lessonTypeAbbrev array", () => {
    expect(filterLessons(makeSchedule(), { lessonTypeAbbrev: ["ЛК", "ЛР"] })).toHaveLength(1);
  });

  it("filters by subjectQuery", () => {
    expect(filterLessons(makeSchedule(), { subjectQuery: "предм" })).toHaveLength(1);
    expect(filterLessons(makeSchedule(), { subjectQuery: "химия" })).toHaveLength(0);
  });

  it("filters by auditory", () => {
    expect(filterLessons(makeSchedule(), { auditory: "101-1" })).toHaveLength(1);
    expect(filterLessons(makeSchedule(), { auditory: "999-9" })).toHaveLength(0);
  });

  // line 11 — lessonAuditories: auditories is null → returns []
  it("treats null auditories as empty when filtering by auditory (line 11)", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeItem({ auditories: null as unknown as string[] })] },
    });
    expect(filterLessons(schedule, { auditory: "101-1" })).toHaveLength(0);
  });

  it("filters by employeeUrlId", () => {
    const itemWithEmployee = makeItem({
      employees: [{
        id: 1, urlId: "v-petrov", firstName: "В", lastName: "П", middleName: null,
        degree: null, degreeAbbrev: null, email: null, rank: null,
        photoLink: null, calendarId: null, jobPositions: null,
      }],
    });
    const schedule = makeSchedule({ schedules: { Понедельник: [itemWithEmployee] } });
    expect(filterLessons(schedule, { employeeUrlId: "v-petrov" })).toHaveLength(1);
    expect(filterLessons(schedule, { employeeUrlId: "other" })).toHaveLength(0);
  });

  it("throws for non-positive weekNumber", () => {
    expect(() => filterLessons(makeSchedule(), { weekNumber: 0 })).toThrow();
  });
});
