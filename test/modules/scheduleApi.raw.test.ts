import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import type { ScheduleItem, ScheduleResponse } from "../../src/types/schedule";

function buildRawPayload(): ScheduleResponse {
  return {
    employeeDto: null,
    studentGroupDto: null,
    schedules: {
      Понедельник: [
        {
          weekNumber: [1],
          studentGroups: [],
          numSubgroup: 0,
          auditories: [],
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
          employees: null
        }
      ]
    },
    exams: [],
    startDate: "12.05.2025",
    endDate: "30.06.2025",
    startExamsDate: null,
    endExamsDate: null
  };
}

function makeLesson(subgroup: number, subject: string): ScheduleItem {
  return {
    weekNumber: [1],
    studentGroups: [],
    numSubgroup: subgroup,
    auditories: [],
    startLessonTime: "09:00",
    endLessonTime: "10:20",
    subject,
    subjectFullName: `${subject} full`,
    note: null,
    lessonTypeAbbrev: "ЛК",
    dateLesson: null,
    startLessonDate: null,
    endLessonDate: null,
    announcement: false,
    split: false,
    employees: null
  };
}

function buildSubgroupPayload(): ScheduleResponse {
  return {
    employeeDto: null,
    studentGroupDto: null,
    schedules: {
      Понедельник: [makeLesson(1, "Math"), makeLesson(2, "Physics")],
      Вторник: [makeLesson(1, "Chem")]
    },
    exams: [makeLesson(2, "Exam")],
    startDate: "01.09.2025",
    endDate: "30.12.2025",
    startExamsDate: "05.01.2026",
    endExamsDate: "15.01.2026"
  };
}

describe("scheduleApi — defaultRaw: true (lines 92–93, 123)", () => {
  it("getGroup returns raw ScheduleResponse when defaultRaw: true (lines 92–93)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      defaultRaw: true,
      validateResponses: false
    });

    const response = await client.schedule.getGroup("053503");
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
    expect(response.exams).toEqual([]);
  });

  it("getEmployee returns raw ScheduleResponse when defaultRaw: true (line 123)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      defaultRaw: true,
      validateResponses: false
    });

    const response = await client.schedule.getEmployee("s-nesterenkov");
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
  });

  // lines 92–93: validateResponses: true triggers assertScheduleResponse in raw mode
  it("getGroup with defaultRaw: true and validateResponses: true calls assertScheduleResponse (lines 92–93)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      defaultRaw: true,
      validateResponses: true
    });
    const response = await client.schedule.getGroup("053503");
    expect("schedules" in response).toBe(true);
  });

  // line 123: same for getEmployee
  it("getEmployee with defaultRaw: true and validateResponses: true (line 123)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      defaultRaw: true,
      validateResponses: true
    });
    const response = await client.schedule.getEmployee("s-nesterenkov");
    expect("schedules" in response).toBe(true);
  });

  it("per-call raw: false overrides defaultRaw: true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      defaultRaw: true,
      validateResponses: false
    });
    const response = await client.schedule.getGroup("053503", { raw: false });
    expect("lessons" in response).toBe(true);
  });

  it("getGroupBySubgroup rawEnvelope preserves envelope fields and filters schedules", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getGroupBySubgroup("053503", 1, {
      rawEnvelope: true
    });

    expect(response.startDate).toBe("01.09.2025");
    expect(response.endDate).toBe("30.12.2025");
    expect(response.exams).toHaveLength(1);
    expect(response.schedules?.Понедельник?.map((item) => item.numSubgroup)).toEqual([1]);
    expect(response.schedules?.Вторник?.map((item) => item.numSubgroup)).toEqual([1]);
  });

  it("getEmployeeBySubgroup rawEnvelope preserves envelope fields and filters schedules", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getEmployeeBySubgroup("s-nesterenkov", 1, {
      rawEnvelope: true
    });

    expect(response.startDate).toBe("01.09.2025");
    expect(response.endDate).toBe("30.12.2025");
    expect(response.exams).toHaveLength(1);
    expect(response.schedules?.Понедельник?.map((item) => item.numSubgroup)).toEqual([1]);
    expect(response.schedules?.Вторник?.map((item) => item.numSubgroup)).toEqual([1]);
  });

  it("rawEnvelope takes precedence over raw: true in subgroup helpers", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getGroupBySubgroup(
      "053503",
      1,
      { raw: true, rawEnvelope: true } as unknown as { rawEnvelope: true }
    );

    expect("schedules" in response).toBe(true);
    expect(Array.isArray(response)).toBe(false);
  });
});
