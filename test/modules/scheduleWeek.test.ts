import { describe, expect, it } from "vitest";
import {
  BsuirValidationError,
  buildScheduleDays,
  getCurrentLesson,
  getLessonsForDate,
  getLessonsForWeek,
  getNextLesson,
  getStudyWeek,
  getTodayLessons,
  getTomorrowLessons,
  normalizeSchedule
} from "../../src";
import type { ScheduleItem, ScheduleResponse } from "../../src/types/schedule";
import { minskTime } from "../helpers/minskTime";

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
    startLessonDate: "01.09.2026",
    endLessonDate: "28.12.2026",
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
    schedules: null,
    exams: null,
    // Live IIS value for groups in autumn 2026 — a Tuesday.
    startDate: "01.09.2026",
    endDate: "28.12.2026",
    startExamsDate: null,
    endExamsDate: null,
    ...overrides
  });
}

function mondayByWeek() {
  return makeSchedule({
    schedules: {
      Понедельник: [1, 2, 3, 4].map((week) =>
        makeLesson({ subject: `W${String(week)}`, weekNumber: [week] })
      )
    }
  });
}

const subjects = (lessons: readonly { subject: string }[]) => lessons.map((l) => l.subject);

describe("getStudyWeek (academic calendar)", () => {
  it("matches the live IIS current-week for autumn 2026 (startDate on a Tuesday)", () => {
    // /schedule/current-week returned 1 on Wed 30.09.2026.
    expect(getStudyWeek(minskTime(2026, 8, 30, 12))).toBe(1);
    expect(getStudyWeek(minskTime(2026, 8, 28))).toBe(1);
    expect(getStudyWeek(minskTime(2026, 8, 27, 23, 59))).toBe(4);
  });

  it("follows the official BSUIR example: 07.09.2015 is week 2, 28.09.2015 is week 1", () => {
    expect(getStudyWeek(minskTime(2015, 8, 1))).toBe(1);
    expect(getStudyWeek(minskTime(2015, 8, 7))).toBe(2);
    expect(getStudyWeek(minskTime(2015, 8, 28))).toBe(1);
  });

  it("counts the days of the September-1 week that fall in August as week 1", () => {
    expect(getStudyWeek(minskTime(2026, 7, 31))).toBe(1);
  });

  it("starts week 1 on Monday 2 September when 1 September is a Sunday", () => {
    expect(getStudyWeek(minskTime(2024, 8, 2))).toBe(1);
    expect(getStudyWeek(minskTime(2024, 8, 9))).toBe(2);
  });

  it("keeps the 4-week cycle running through the spring term", () => {
    // Mon 08.02.2027 is 23 weeks after Mon 31.08.2026 → 23 mod 4 = 3 → week 4.
    expect(getStudyWeek(minskTime(2027, 1, 8))).toBe(4);
  });

  it("reads the calendar date in the requested time zone", () => {
    const mondayInMinsk = new Date("2026-09-27T21:30:00Z"); // Mon 00:30 Minsk, Sun in UTC
    expect(getStudyWeek(mondayInMinsk)).toBe(1);
    expect(getStudyWeek(mondayInMinsk, { timeZone: "UTC" })).toBe(4);
  });
});

describe("getStudyWeek (currentWeek anchor)", () => {
  const now = minskTime(2026, 8, 30, 12); // Wednesday

  it("counts weeks from currentWeek at now, changing on Mondays", () => {
    const options = { currentWeek: 3, now };
    expect(getStudyWeek(minskTime(2026, 8, 28), options)).toBe(3);
    expect(getStudyWeek(minskTime(2026, 9, 4, 23), options)).toBe(3);
    expect(getStudyWeek(minskTime(2026, 9, 5), options)).toBe(4);
    expect(getStudyWeek(minskTime(2026, 9, 12), options)).toBe(1);
    expect(getStudyWeek(minskTime(2026, 8, 27), options)).toBe(2);
  });

  it.each([0, 5, 1.5, Number.NaN, "2"])("rejects currentWeek %s", (currentWeek) => {
    expect(() => getStudyWeek(now, { currentWeek: currentWeek as number, now })).toThrow(
      BsuirValidationError
    );
  });

  it("rejects unknown time zones", () => {
    expect(() => getStudyWeek(now, { timeZone: "Mars/Olympus_Mons" })).toThrow(
      BsuirValidationError
    );
    expect(() => getStudyWeek(now, { timeZone: " " })).toThrow(BsuirValidationError);
  });
});

describe("getLessonsForDate week selection", () => {
  it("picks week-1 lessons on Monday 28.09.2026 (regression: was week 4)", () => {
    expect(subjects(getLessonsForDate(mondayByWeek(), minskTime(2026, 8, 28)))).toEqual(["W1"]);
  });

  it("does not depend on an employee-style startDate (first lesson on a Thursday)", () => {
    const schedule = makeSchedule({
      startDate: "03.09.2026",
      schedules: mondayByWeek().schedules
    });
    // Mon 07.09.2026 is study week 2 (old startDate-based count said 1).
    expect(subjects(getLessonsForDate(schedule, minskTime(2026, 8, 7)))).toEqual(["W2"]);
  });

  it("uses currentWeek when provided", () => {
    const lessons = getLessonsForDate(mondayByWeek(), minskTime(2026, 8, 28), {
      currentWeek: 3,
      now: minskTime(2026, 8, 30, 12)
    });
    expect(subjects(lessons)).toEqual(["W3"]);
  });

  it("finds auto-flattened next-term lessons between terms (regression)", () => {
    const schedule = makeSchedule({
      nextSchedules: {
        Понедельник: [makeLesson({ subject: "NEXT", weekNumber: [1, 2, 3, 4] })]
      }
    });
    expect(subjects(getLessonsForDate(schedule, minskTime(2026, 9, 5)))).toEqual(["NEXT"]);
  });

  it("getLessonsForWeek includes auto-flattened next-term lessons but never exams", () => {
    const schedule = makeSchedule({
      nextSchedules: { Вторник: [makeLesson({ subject: "NEXT", weekNumber: [2] })] },
      exams: [makeLesson({ subject: "EXAM", weekNumber: [2], dateLesson: "10.01.2027" })]
    });
    expect(subjects(getLessonsForWeek(schedule, 2))).toEqual(["NEXT"]);
  });

  it("counts absolute weeks from the Monday of startDate when weekNumber exceeds 4", () => {
    const schedule = makeSchedule({
      startDate: "03.09.2026",
      schedules: {
        Понедельник: [
          makeLesson({ subject: "ABS2", weekNumber: [2, 6] }),
          makeLesson({ subject: "ABS5", weekNumber: [5] })
        ]
      }
    });
    expect(subjects(getLessonsForDate(schedule, minskTime(2026, 8, 7)))).toEqual(["ABS2"]);
    expect(subjects(getLessonsForDate(schedule, minskTime(2026, 8, 28)))).toEqual(["ABS5"]);
  });
});

describe("time zone handling", () => {
  const schedule = makeSchedule({
    schedules: {
      Понедельник: [makeLesson({ subject: "MON", weekNumber: null })],
      Среда: [
        makeLesson({ subject: "WED-1", weekNumber: null }),
        makeLesson({
          subject: "WED-2",
          weekNumber: null,
          startLessonTime: "10:35",
          endLessonTime: "11:55"
        })
      ]
    }
  });

  it("detects the current lesson by Minsk wall-clock time on any server zone", () => {
    const at = new Date("2026-09-30T06:30:00Z"); // 09:30 in Minsk
    const today = getTodayLessons(schedule, at);
    expect(subjects(today)).toEqual(["WED-1", "WED-2"]);
    expect(getCurrentLesson(today, at)?.subject).toBe("WED-1");
    expect(getNextLesson(today, at)?.subject).toBe("WED-2");
  });

  it("honors an explicit timeZone for wall-clock comparisons", () => {
    const at = new Date("2026-09-30T06:30:00Z");
    const today = getTodayLessons(schedule, at);
    expect(getCurrentLesson(today, at, { timeZone: "UTC" })).toBeNull();
    expect(getNextLesson(today, at, { timeZone: "UTC" })?.subject).toBe("WED-1");
  });

  it("switches today/tomorrow at Minsk midnight, not UTC midnight", () => {
    const at = new Date("2026-09-27T22:30:00Z"); // Mon 01:30 in Minsk, still Sunday in UTC
    expect(subjects(getTodayLessons(schedule, at))).toEqual(["MON"]);
    expect(getTomorrowLessons(schedule, at)).toEqual([]);
    expect(getTodayLessons(schedule, at, { timeZone: "UTC" })).toEqual([]);
    expect(subjects(getTomorrowLessons(schedule, at, { timeZone: "UTC" }))).toEqual(["MON"]);
  });
});

describe("buildScheduleDays", () => {
  it("builds Minsk calendar days with week numbers across a week boundary", () => {
    const days = buildScheduleDays(mondayByWeek(), {
      now: minskTime(2026, 8, 27, 10), // Sunday
      days: 2
    });
    expect(days.map((day) => day.dateKey)).toEqual(["2026-09-27", "2026-09-28"]);
    expect(days.map((day) => day.weekNumber)).toEqual([4, 1]);
    expect(days.map((day) => day.weekdayLabel)).toEqual(["Воскресенье", "Понедельник"]);
    expect(days.map((day) => day.isToday)).toEqual([true, false]);
    expect(days[1]?.date.getTime()).toBe(minskTime(2026, 8, 28).getTime());
    expect(subjects(days[1]?.lessons ?? [])).toEqual(["W1"]);
  });

  it("passes currentWeek and timeZone through", () => {
    const now = new Date("2026-09-28T07:00:00Z"); // Mon 10:00 Minsk
    const [today] = buildScheduleDays(mondayByWeek(), { now, days: 1, currentWeek: 2 });
    expect(today?.weekNumber).toBe(2);
    expect(subjects(today?.lessons ?? [])).toEqual(["W2"]);
    expect(today?.currentLesson?.subject).toBe("W2");

    const [inUtc] = buildScheduleDays(mondayByWeek(), { now, days: 1, timeZone: "UTC" });
    expect(inUtc?.dateKey).toBe("2026-09-28");
    expect(inUtc?.date.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(inUtc?.currentLesson).toBeNull(); // 07:00 UTC is before 09:00
  });
});
