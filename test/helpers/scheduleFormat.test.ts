import { describe, expect, it } from "vitest";
import {
  formatEmployeeShortName,
  formatLessonAuditories,
  formatLessonEmployees,
  formatLessonSubgroup,
  formatLessonTimeRange,
  formatLessonType,
  formatLessonWeekNumbers
} from "../../src/helpers/scheduleFormat";
import type { Employee } from "../../src/types/employee";
import type { FlattenedScheduleItem } from "../../src/types/schedule";

function makeLesson(
  overrides: Partial<FlattenedScheduleItem> = {}
): Pick<
  FlattenedScheduleItem,
  | "startLessonTime"
  | "endLessonTime"
  | "lessonTypeAbbrev"
  | "numSubgroup"
  | "weekNumber"
  | "auditories"
  | "employees"
> {
  return {
    startLessonTime: "09:00",
    endLessonTime: "10:20",
    lessonTypeAbbrev: "ЛК",
    numSubgroup: 0,
    weekNumber: [1],
    auditories: [],
    employees: null,
    ...overrides
  };
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 1,
    urlId: "ivanov",
    calendarId: "cal",
    firstName: "Иван",
    lastName: "Иванов",
    middleName: "Иванович",
    degree: "Доцент",
    degreeAbbrev: "доц.",
    email: null,
    rank: null,
    photoLink: "",
    jobPositions: null,
    ...overrides
  };
}

describe("formatLessonTimeRange", () => {
  it("returns start–end when both times are present", () => {
    expect(formatLessonTimeRange(makeLesson())).toBe("09:00–10:20");
  });

  it("returns only start when end is empty", () => {
    expect(formatLessonTimeRange(makeLesson({ endLessonTime: "" }))).toBe("09:00");
  });

  it("returns only end when start is empty", () => {
    expect(formatLessonTimeRange(makeLesson({ startLessonTime: "" }))).toBe("10:20");
  });

  it("returns empty string when both times are empty", () => {
    expect(formatLessonTimeRange(makeLesson({ startLessonTime: "", endLessonTime: "" }))).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(
      formatLessonTimeRange(makeLesson({ startLessonTime: " 09:00 ", endLessonTime: " 10:20 " }))
    ).toBe("09:00–10:20");
  });

  it("returns empty string when time fields are nullish", () => {
    expect(
      formatLessonTimeRange(
        makeLesson({
          startLessonTime: null as unknown as string,
          endLessonTime: undefined as unknown as string
        })
      )
    ).toBe("");
  });
});

describe("formatLessonType", () => {
  it("returns the abbreviation", () => {
    expect(formatLessonType(makeLesson({ lessonTypeAbbrev: "ПЗ" }))).toBe("ПЗ");
  });

  it("returns empty string when lessonTypeAbbrev is null", () => {
    expect(formatLessonType(makeLesson({ lessonTypeAbbrev: null }))).toBe("");
  });

  it("trims whitespace", () => {
    expect(formatLessonType(makeLesson({ lessonTypeAbbrev: " ЛР " }))).toBe("ЛР");
  });
});

describe("formatLessonSubgroup", () => {
  it("returns empty string for subgroup 0", () => {
    expect(formatLessonSubgroup(makeLesson({ numSubgroup: 0 }))).toBe("");
  });

  it("returns formatted label for subgroup 1", () => {
    expect(formatLessonSubgroup(makeLesson({ numSubgroup: 1 }))).toBe("1 подгруппа");
  });

  it("returns formatted label for subgroup 2", () => {
    expect(formatLessonSubgroup(makeLesson({ numSubgroup: 2 }))).toBe("2 подгруппа");
  });
});

describe("formatLessonWeekNumbers", () => {
  it("returns 'кажд. нед.' for null", () => {
    expect(formatLessonWeekNumbers(makeLesson({ weekNumber: null }))).toBe("кажд. нед.");
  });

  it("returns 'кажд. нед.' for empty array", () => {
    expect(formatLessonWeekNumbers(makeLesson({ weekNumber: [] }))).toBe("кажд. нед.");
  });

  it("formats a single week number", () => {
    expect(formatLessonWeekNumbers(makeLesson({ weekNumber: [3] }))).toBe("3 нед.");
  });

  it("formats multiple week numbers joined by comma", () => {
    expect(formatLessonWeekNumbers(makeLesson({ weekNumber: [1, 3] }))).toBe("1, 3 нед.");
  });
});

describe("formatLessonAuditories", () => {
  it("returns empty string for empty auditories list", () => {
    expect(formatLessonAuditories(makeLesson({ auditories: [] }))).toBe("");
  });

  it("returns empty string when auditories is nullish", () => {
    expect(formatLessonAuditories(makeLesson({ auditories: null as unknown as string[] }))).toBe(
      ""
    );
  });

  it("returns single auditory", () => {
    expect(formatLessonAuditories(makeLesson({ auditories: ["101-2"] }))).toBe("101-2");
  });

  it("joins multiple auditories with comma", () => {
    expect(formatLessonAuditories(makeLesson({ auditories: ["101-2", "102-3"] }))).toBe(
      "101-2, 102-3"
    );
  });
});

describe("formatEmployeeShortName", () => {
  it("formats full name as Фамилия И.О.", () => {
    expect(formatEmployeeShortName(makeEmployee())).toBe("Иванов И.И.");
  });

  it("omits patronymic initial when middleName is empty", () => {
    expect(formatEmployeeShortName(makeEmployee({ middleName: "" }))).toBe("Иванов И.");
  });

  it("omits both initials when firstName and middleName are empty", () => {
    expect(formatEmployeeShortName(makeEmployee({ firstName: "", middleName: "" }))).toBe("Иванов");
  });

  it("trims whitespace in name parts", () => {
    expect(
      formatEmployeeShortName(
        makeEmployee({ lastName: " Петров ", firstName: " Пётр ", middleName: " Петрович " })
      )
    ).toBe("Петров П.П.");
  });

  it("treats nullish name parts as empty", () => {
    expect(
      formatEmployeeShortName(
        makeEmployee({
          lastName: null as unknown as string,
          firstName: undefined as unknown as string,
          middleName: null as unknown as string
        })
      )
    ).toBe("");
  });
});

describe("formatLessonEmployees", () => {
  it("returns empty string when employees is null", () => {
    expect(formatLessonEmployees(makeLesson({ employees: null }))).toBe("");
  });

  it("returns empty string when employees array is empty", () => {
    expect(formatLessonEmployees(makeLesson({ employees: [] }))).toBe("");
  });

  it("formats a single employee", () => {
    expect(formatLessonEmployees(makeLesson({ employees: [makeEmployee()] }))).toBe("Иванов И.И.");
  });

  it("joins multiple employees with comma", () => {
    const emp2 = makeEmployee({
      id: 2,
      lastName: "Петров",
      firstName: "Пётр",
      middleName: "Петрович"
    });
    expect(formatLessonEmployees(makeLesson({ employees: [makeEmployee(), emp2] }))).toBe(
      "Иванов И.И., Петров П.П."
    );
  });
});
