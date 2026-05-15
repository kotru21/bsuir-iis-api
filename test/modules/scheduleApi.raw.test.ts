import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import type { ScheduleResponse } from "../../src/types/schedule";

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
          employees: null,
        },
      ],
    },
    exams: [],
    startDate: "12.05.2025",
    endDate: "30.06.2025",
    startExamsDate: null,
    endExamsDate: null,
  };
}

describe("scheduleApi — defaultRaw: true (lines 92–93, 123)", () => {
  it("getGroup returns raw ScheduleResponse when defaultRaw: true (lines 92–93)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, defaultRaw: true, validateResponses: false });

    const response = await client.schedule.getGroup("053503");

    // raw response has schedules/exams, not flattened lessons
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
    expect(response.exams).toEqual([]);
  });

  it("getEmployee returns raw ScheduleResponse when defaultRaw: true (line 123)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, defaultRaw: true, validateResponses: false });

    const response = await client.schedule.getEmployee("s-nesterenkov");

    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
  });

  it("per-call raw: false overrides defaultRaw: true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, defaultRaw: true, validateResponses: false });

    const response = await client.schedule.getGroup("053503", { raw: false });

    expect("lessons" in response).toBe(true);
  });
});
