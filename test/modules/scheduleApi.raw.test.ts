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
      Понедельник: [makeLesson(0, "Shared"), makeLesson(1, "Math"), makeLesson(2, "Physics")],
      Вторник: [makeLesson(1, "Chem")]
    },
    exams: [makeLesson(2, "Exam")],
    startDate: "01.09.2025",
    endDate: "30.12.2025",
    startExamsDate: "05.01.2026",
    endExamsDate: "15.01.2026"
  };
}

describe("scheduleApi — explicit raw/envelope behavior", () => {
  it("getGroup returns raw ScheduleResponse using getGroupRaw", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getGroupRaw("053503");
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
    expect(response.exams).toEqual([]);
  });

  it("getEmployee returns raw ScheduleResponse using getEmployeeRaw", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getEmployeeRaw("s-nesterenkov");
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
  });

  // lines 92–93: validateResponses: true triggers assertScheduleResponse in raw mode
  it("getGroupRaw with validateResponses: true calls assertScheduleResponse", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    const response = await client.schedule.getGroupRaw("053503");
    expect("schedules" in response).toBe(true);
  });

  // line 123: same for getEmployee
  it("getEmployeeRaw with validateResponses: true calls assertScheduleResponse", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    const response = await client.schedule.getEmployeeRaw("s-nesterenkov");
    expect("schedules" in response).toBe(true);
  });

  it("per-call raw: false returns normalized payload", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    const response = await client.schedule.getGroup("053503");
    expect("lessons" in response).toBe(true);
  });

  it("getGroupBySubgroupEnvelope preserves envelope fields and filters schedules", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getGroupBySubgroupEnvelope("053503", 1);

    expect(response.startDate).toBe("01.09.2025");
    expect(response.endDate).toBe("30.12.2025");
    expect(response.exams).toHaveLength(1);
    expect(response.schedules?.Понедельник?.map((item) => item.numSubgroup)).toEqual([0, 1]);
    expect(response.schedules?.Вторник?.map((item) => item.numSubgroup)).toEqual([1]);
  });

  it("getEmployeeBySubgroupEnvelope preserves envelope fields and filters schedules", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getEmployeeBySubgroupEnvelope("s-nesterenkov", 1);

    expect(response.startDate).toBe("01.09.2025");
    expect(response.endDate).toBe("30.12.2025");
    expect(response.exams).toHaveLength(1);
    expect(response.schedules?.Понедельник?.map((item) => item.numSubgroup)).toEqual([0, 1]);
    expect(response.schedules?.Вторник?.map((item) => item.numSubgroup)).toEqual([1]);
  });

  it("getGroupBySubgroupRaw returns filtered ScheduleItem array including shared lessons", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const lessons = await client.schedule.getGroupBySubgroupRaw("053503", 2);
    expect(Array.isArray(lessons)).toBe(true);
    expect(lessons.map((item) => item.subject)).toEqual(["Shared", "Physics"]);
    expect(lessons.map((item) => item.numSubgroup)).toEqual([0, 2]);
  });

  it("subgroup helpers throw typed error for non-array weekday buckets", async () => {
    const { BsuirResponseValidationError } = await import("../../src/client/errors");
    const payload = buildSubgroupPayload();
    (payload.schedules as Record<string, unknown>).Понедельник = { bad: true };

    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: payload }),
      createJsonResponse({ body: payload }),
      createJsonResponse({ body: payload })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    await expect(client.schedule.getGroupBySubgroupRaw("053503", 1)).rejects.toMatchObject({
      name: "BsuirResponseValidationError",
      endpoint: "/schedule"
    });
    await expect(client.schedule.getGroupBySubgroupEnvelope("053503", 1)).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    await expect(
      client.schedule.getEmployeeBySubgroupRaw("s-nesterenkov", 1)
    ).rejects.toMatchObject({
      name: "BsuirResponseValidationError",
      endpoint: "/employees/schedule/s-nesterenkov"
    });
  });
});
