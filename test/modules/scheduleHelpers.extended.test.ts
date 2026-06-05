import { describe, expect, it } from "vitest";
import {
  buildScheduleDays,
  getCurrentLesson,
  getLessonsForDate,
  getLessonsForWeek,
  getNextLesson,
  sortLessonsByTime
} from "../../src";
import { normalizeSchedule } from "../../src/modules/scheduleNormalize";
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
    ...overrides
  };
}

function makeSchedule(overrides: Partial<ScheduleResponse> = {}) {
  return normalizeSchedule({
    employeeDto: null,
    studentGroupDto: null,
    schedules: {},
    exams: [],
    startDate: "12.05.2025",
    endDate: "30.06.2025",
    startExamsDate: null,
    endExamsDate: null,
    ...overrides
  });
}

describe("parseDdMmYyyyParts — invalid inputs (line 43, 54)", () => {
  it("ignores lessons with unparseable dateLesson format (line 43)", () => {
    // dateLesson "not-a-date" fails regex → toLessonDateKey → null → falls to weekly branch
    // Monday 12.05.2025 is week 1 → lesson with weekNumber [1] matches
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson({ dateLesson: "not-a-date" })] }
    });
    const lessons = getLessonsForDate(schedule, new Date(2025, 4, 12));
    expect(lessons).toHaveLength(1);
  });

  it("returns no match for impossible date 31.02 in dateLesson (line 54)", () => {
    // regex matches but Date.UTC rolls over → utcDate.getUTCDate() !== 31 → null
    const schedule = makeSchedule({ exams: [makeLesson({ dateLesson: "31.02.2025" })] });
    const lessons = getLessonsForDate(schedule, new Date(2025, 1, 28));
    expect(lessons.filter((l) => l.source === "exams")).toHaveLength(0);
  });
});

describe("isWithinLessonDateRange — out-of-range (lines 112, 116)", () => {
  it("excludes lesson when target is before startLessonDate (line 112)", () => {
    const schedule = makeSchedule({
      schedules: {
        Понедельник: [makeLesson({ startLessonDate: "19.05.2025", endLessonDate: "30.06.2025" })]
      }
    });
    // 12.05.2025 (Mon, week 1) < startLessonDate 19.05.2025
    expect(getLessonsForDate(schedule, new Date(2025, 4, 12))).toHaveLength(0);
  });

  it("excludes lesson when target is after endLessonDate (line 116)", () => {
    const schedule = makeSchedule({
      schedules: {
        Понедельник: [makeLesson({ startLessonDate: "12.05.2025", endLessonDate: "12.05.2025" })]
      }
    });
    // 19.05.2025 > endLessonDate 12.05.2025
    expect(getLessonsForDate(schedule, new Date(2025, 4, 19))).toHaveLength(0);
  });
});

describe("usesFourWeekCycle (line 137)", () => {
  it("uses absolute week when weekNumber > 4 (not 4-week cycle, line 137)", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson({ weekNumber: [5] })] }
    });
    // week 1 from startDate, lesson is [5] → no match
    expect(getLessonsForDate(schedule, new Date(2025, 4, 12))).toHaveLength(0);
  });

  it("empty scheduleLessons → usesFourWeekCycle returns false (values.length=0, line 137)", () => {
    const schedule = makeSchedule();
    expect(getLessonsForDate(schedule, new Date(2025, 4, 12))).toHaveLength(0);
  });
});

describe("inferWeekNumberForDate edge cases (lines 150, 153)", () => {
  it("fails closed when startDate is null by default", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson()] },
      startDate: null,
      endDate: null
    });
    expect(getLessonsForDate(schedule, new Date(2025, 4, 12))).toHaveLength(0);
  });

  it("keeps previous permissive behavior when requested", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson()] },
      startDate: null,
      endDate: null
    });
    expect(
      getLessonsForDate(schedule, new Date(2025, 4, 12), {
        unknownWeekBehavior: "include"
      })
    ).toHaveLength(1);
  });

  it("fails closed when date is before startDate by default", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson()] },
      startDate: "19.05.2025"
    });
    expect(getLessonsForDate(schedule, new Date(2025, 4, 12))).toHaveLength(0);
  });

  it("normalizes getLessonsForWeek input for four-week cycle schedules", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson({ weekNumber: [1] })] }
    });

    expect(getLessonsForWeek(schedule, 5)).toHaveLength(1);
  });
});

describe("exam without dateLesson (lines 180, 184)", () => {
  it("excludes exam with no dateLesson and no date range (line 180)", () => {
    const schedule = makeSchedule({ exams: [makeLesson()] });
    const exams = getLessonsForDate(schedule, new Date(2025, 4, 12)).filter(
      (l) => l.source === "exams"
    );
    expect(exams).toHaveLength(0);
  });

  it("includes exam with no dateLesson but within startLessonDate–endLessonDate (line 184)", () => {
    const schedule = makeSchedule({
      exams: [
        makeLesson({ dateLesson: null, startLessonDate: "12.05.2025", endLessonDate: "14.05.2025" })
      ]
    });
    const exams = getLessonsForDate(schedule, new Date(2025, 4, 13)).filter(
      (l) => l.source === "exams"
    );
    expect(exams).toHaveLength(1);
  });
});

describe("sortLessonsByTime — tie-breaking (lines 225–228)", () => {
  it("sorts by endLessonTime when startLessonTime equal", () => {
    const lessons = [
      makeLesson({ subject: "B", startLessonTime: "09:00", endLessonTime: "11:20" }),
      makeLesson({ subject: "A", startLessonTime: "09:00", endLessonTime: "10:20" })
    ];
    expect(sortLessonsByTime(lessons).map((l) => l.subject)).toEqual(["A", "B"]);
  });

  it("preserves original order (stable index) when start and end equal", () => {
    const lessons = [makeLesson({ subject: "First" }), makeLesson({ subject: "Second" })];
    expect(sortLessonsByTime(lessons).map((l) => l.subject)).toEqual(["First", "Second"]);
  });

  it("puts lessons with invalid start time last", () => {
    const lessons = [
      makeLesson({ subject: "Invalid", startLessonTime: "??" }),
      makeLesson({ subject: "Valid", startLessonTime: "08:00" })
    ];
    const sorted = sortLessonsByTime(lessons);
    expect(sorted[0]?.subject).toBe("Valid");
    expect(sorted[1]?.subject).toBe("Invalid");
  });
});

describe("buildScheduleDays — Sunday and includeCurrentAndNextLessons (lines 351, 355–357)", () => {
  it("labels Sunday as 'Воскресенье' (line 351)", () => {
    const schedule = makeSchedule();
    // 18.05.2025 is Sunday
    const days = buildScheduleDays(schedule, {
      now: new Date(2025, 4, 18, 10, 0),
      startDate: new Date(2025, 4, 18),
      days: 1
    });
    expect(days[0]?.weekday).toBeNull();
    expect(days[0]?.weekdayLabel).toBe("Воскресенье");
  });

  it("skips currentLesson/nextLesson when includeCurrentAndNextLessons: false (lines 355–357)", () => {
    const schedule = makeSchedule({
      schedules: { Понедельник: [makeLesson()] }
    });
    const days = buildScheduleDays(schedule, {
      now: new Date(2025, 4, 12, 9, 30),
      startDate: new Date(2025, 4, 12),
      days: 1,
      includeCurrentAndNextLessons: false
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
