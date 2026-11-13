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

describe("scheduleApi — raw envelope and filtered normalized views", () => {
  it("getRaw({ group }) returns the raw ScheduleResponse", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getRaw({ group: "053503" });
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
    expect(response.exams).toEqual([]);
  });

  it("getRaw({ employee }) returns the raw ScheduleResponse", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getRaw({ employee: "s-nesterenkov" });
    expect("schedules" in response).toBe(true);
    expect("lessons" in response).toBe(false);
  });

  it("getRaw validates deeply with validateResponses: true", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: buildRawPayload() }),
      createJsonResponse({ body: buildRawPayload() })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.schedule.getRaw({ group: "053503" })).resolves.toHaveProperty("schedules");
    await expect(client.schedule.getRaw({ employee: "s-nesterenkov" })).resolves.toHaveProperty(
      "schedules"
    );
  });

  it("get returns the normalized payload", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    const response = await client.schedule.get({ group: "053503" });
    expect("lessons" in response).toBe(true);
  });

  it("a subgroup filter keeps envelope fields and narrows the maps (group and employee)", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: buildSubgroupPayload() }),
      createJsonResponse({ body: buildSubgroupPayload() })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    for (const target of [{ group: "053503" }, { employee: "s-nesterenkov" }] as const) {
      const response = await client.schedule.get(target, { filter: { subgroup: 1 } });
      expect(response.startDate).toBe("01.09.2025");
      expect(response.endDate).toBe("30.12.2025");
      expect(response.schedules.Понедельник?.map((item) => item.numSubgroup)).toEqual([0, 1]);
      expect(response.schedules.Вторник?.map((item) => item.numSubgroup)).toEqual([1]);
      // Exams follow the same filter: the fixture exam belongs to subgroup 2.
      expect(response.exams).toEqual([]);
    }
  });

  it("a subgroup filter keeps shared lessons in the flattened views", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const { lessons } = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 2 } });
    expect(lessons.map((item) => item.subject)).toEqual(["Shared", "Physics", "Exam"]);
    expect(lessons.map((item) => item.numSubgroup)).toEqual([0, 2, 2]);
  });

  it("filtered reads throw a typed error for non-array weekday buckets", async () => {
    const payload = buildSubgroupPayload();
    (payload.schedules as Record<string, unknown>).Понедельник = { bad: true };

    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: payload }),
      createJsonResponse({ body: payload })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    await expect(
      client.schedule.get({ group: "053503" }, { filter: { subgroup: 1 } })
    ).rejects.toMatchObject({ name: "BsuirResponseValidationError", endpoint: "/schedule" });
    await expect(
      client.schedule.get({ employee: "s-nesterenkov" }, { filter: { subgroup: 1 } })
    ).rejects.toMatchObject({
      name: "BsuirResponseValidationError",
      endpoint: "/employees/schedule/s-nesterenkov"
    });
  });
});
