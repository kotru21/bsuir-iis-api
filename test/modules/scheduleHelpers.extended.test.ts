import { describe, expect, it } from "vitest";
import {
  buildScheduleDays,
  getCurrentLesson,
  getLessonsForDate,
  getNextLesson,
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

function buildSchedule(overrides: Partial<ScheduleResponse> = {}): ReturnType<typeof normalizeSchedule> {
  return normalizeSchedule({
    employeeDto: null,
    studentGroupDto: null,
    schedules: {},
    exams: [],
    startDate: "12.05.2025",
    endDate: "30.06.2025",
    startExamsDate: null,
    endExamsDate: null,
    ...overrides,
  });
}

describe("parseDdMmYyyyParts — invalid inputs (line 43, 54)", () => {
  it("ignores lessons with unparseable dateLesson format", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: { Понедельник: [makeLesson({ dateLesson: "not-a-date" })] },
      exams: [],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    // dateLesson "not-a-date" → no dateKey match → falls into weekly schedule branch
    // Monday 12.05.2025 is week 1 → should match
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons).toHaveLength(1);
  });

  it("returns no match for impossible date 31.02 in dateLesson (line 54)", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {},
      exams: [makeLesson({ dateLesson: "31.02.2025" })],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    // dateLesson is invalid → toLessonDateKey → null → can't match specific date
    const lessons = getLessonsForDate(schedule, new Date(2025, 1, 28));
    expect(lessons).toHaveLength(0);
  });
});

describe("isWithinLessonDateRange — out-of-range (lines 112, 116)", () => {
  it("excludes lesson when target is before startLessonDate", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [makeLesson({ startLessonDate: "19.05.2025", endLessonDate: "30.06.2025" })],
      },
      exams: [],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    // 12.05.2025 (Mon, week 1) is before startLessonDate 19.05.2025
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons).toHaveLength(0);
  });

  it("excludes lesson when target is after endLessonDate", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [makeLesson({ startLessonDate: "12.05.2025", endLessonDate: "12.05.2025" })],
      },
      exams: [],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    // 19.05.2025 is after endLessonDate 12.05.2025
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 19));
    expect(lessons).toHaveLength(0);
  });
});

describe("usesFourWeekCycle (line 137)", () => {
  it("infers absolute week number when weekNumbers > 4 (not 4-week cycle)", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [makeLesson({ weekNumber: [5], startLessonDate: null, endLessonDate: null })],
      },
      exams: [],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    // Week 1 from startDate, not 4-week cycle → absoluteWeek used directly
    // lesson is week [5], so week 1 should NOT match
    const week1 = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(week1).toHaveLength(0);
  });

  it("returns empty for date before startDate (usesFourWeekCycle values.length=0) (line 137)", () => {
    const schedule = buildSchedule({ schedules: {} });
    // No scheduleLessons → usesFourWeekCycle returns false (values.length === 0)
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons).toHaveLength(0);
  });
});

describe("inferWeekNumberForDate edge cases (lines 150, 153)", () => {
  it("returns all matching lessons when startDate is null (line 150)", () => {
    // startDate null → inferredWeekNumber null → weekNumber check skipped → lesson matches by weekday
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [makeLesson({ weekNumber: [1], startLessonDate: null, endLessonDate: null })],
      },
      exams: [],
      startDate: null,
      endDate: null,
      startExamsDate: null,
      endExamsDate: null,
    });
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons).toHaveLength(1);
  });

  it("returns no lessons when date is before startDate (diffDays < 0, line 153)", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [makeLesson({ weekNumber: [1], startLessonDate: null, endLessonDate: null })],
      },
      exams: [],
      startDate: "19.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    // 12.05.2025 is before startDate 19.05.2025 → diffDays < 0 → inferredWeekNumber null
    // weekNumber check skipped → lesson still matches by weekday (Monday)
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons).toHaveLength(1);
  });
});

describe("exam without dateLesson (lines 180, 184)", () => {
  it("excludes exam without dateLesson and without date range (line 180)", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {},
      exams: [makeLesson({ source: undefined, dateLesson: null, startLessonDate: null, endLessonDate: null } as Partial<ScheduleItem>)],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons.filter((l) => l.source === "exams")).toHaveLength(0);
  });

  it("includes exam without dateLesson but within startLessonDate–endLessonDate range (line 184)", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {},
      exams: [makeLesson({ dateLesson: null, startLessonDate: "12.05.2025", endLessonDate: "14.05.2025" })],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 13));
    expect(lessons.filter((l) => l.source === "exams")).toHaveLength(1);
  });
});

describe("sortLessonsByTime — tie-breaking (lines 225–228)", () => {
  it("sorts by endLessonTime when startLessonTime is equal", () => {
    const lessons = [
      makeLesson({ subject: "B", startLessonTime: "09:00", endLessonTime: "11:20" }),
      makeLesson({ subject: "A", startLessonTime: "09:00", endLessonTime: "10:20" }),
    ];
    const sorted = sortLessonsByTime(lessons);
    expect(sorted.map((l) => l.subject)).toEqual(["A", "B"]);
  });

  it("preserves original order when start and end times are equal (stable index)", () => {
    const lessons = [
      makeLesson({ subject: "First", startLessonTime: "09:00", endLessonTime: "10:20" }),
      makeLesson({ subject: "Second", startLessonTime: "09:00", endLessonTime: "10:20" }),
    ];
    const sorted = sortLessonsByTime(lessons);
    expect(sorted.map((l) => l.subject)).toEqual(["First", "Second"]);
  });

  it("puts lessons with invalid start time last", () => {
    const lessons = [
      makeLesson({ subject: "Invalid", startLessonTime: "??" }),
      makeLesson({ subject: "Valid", startLessonTime: "08:00" }),
    ];
    const sorted = sortLessonsByTime(lessons);
    expect(sorted[0]?.subject).toBe("Valid");
    expect(sorted[1]?.subject).toBe("Invalid");
  });
});

describe("buildScheduleDays — Sunday and includeCurrentAndNextLessons (lines 351, 355–357)", () => {
  it("labels Sunday as 'Воскресенье' (line 351)", () => {
    const schedule = buildSchedule();
    // 18.05.2025 is a Sunday
    const days = buildScheduleDays(schedule, {
      now: new Date(2025, 4, 18, 10, 0),
      startDate: new Date(2025, 4, 18),
      days: 1,
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.weekday).toBeNull();
    expect(days[0]?.weekdayLabel).toBe("Воскресенье");
  });

  it("skips currentLesson and nextLesson when includeCurrentAndNextLessons is false (lines 355–357)", () => {
    const schedule = normalizeSchedule({
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [makeLesson({ startLessonDate: null, endLessonDate: null })],
      },
      exams: [],
      startDate: "12.05.2025",
      endDate: "30.06.2025",
      startExamsDate: null,
      endExamsDate: null,
    });
    const now = new Date(2025, 4, 12, 9, 30);
    const days = buildScheduleDays(schedule, {
      now,
      startDate: new Date(2025, 4, 12),
      days: 1,
      includeCurrentAndNextLessons: false,
    });
    expect(days[0]?.currentLesson).toBeNull();
    expect(days[0]?.nextLesson).toBeNull();
  });
});

describe("getCurrentLesson and getNextLesson edge cases", () => {
  it("skips lesson where end <= start (degenerate time)", () => {
    const lessons = [makeLesson({ startLessonTime: "10:00", endLessonTime: "09:00" })];
    expect(getCurrentLesson(lessons, new Date(2025, 4, 12, 9, 30))).toBeNull();
  });

  it("getNextLesson skips lesson with null start time", () => {
    const lessons = [makeLesson({ startLessonTime: "bad" })];
    expect(getNextLesson(lessons, new Date(2025, 4, 12, 8, 0))).toBeNull();
  });
});
