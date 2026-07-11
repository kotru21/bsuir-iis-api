import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import { buildScheduleResponse } from "./scheduleFixtures";

describe("schedule module — filters", () => {
  it("supports getEmployeeFiltered and getEmployeeExams", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: buildScheduleResponse() }),
      createJsonResponse({ body: buildScheduleResponse() })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getEmployeeFiltered("s-nesterenkov", {
      source: "schedules",
      weekday: "Понедельник"
    });
    const exams = await client.schedule.getEmployeeExams("s-nesterenkov");

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0]?.day).toBe("Понедельник");
    expect(exams.length).toBeGreaterThan(0);
    expect(exams[0]?.source).toBe("exams");
  });

  it("supports filtered schedule queries", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "exams",
      lessonTypeAbbrev: "Экзамен"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.source).toBe("exams");
    expect(filtered[0]?.lessonTypeAbbrev).toBe("Экзамен");
  });

  it("supports filtering by weekday and employee", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      weekday: "Понедельник",
      employeeUrlId: "v-vladymtsev",
      subjectQuery: "английский"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.day).toBe("Понедельник");
    expect(filtered[0]?.employees?.[0]?.urlId).toBe("v-vladymtsev");
  });

  it("supports combined schedule filters", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      weekNumber: 1,
      subgroup: 1,
      lessonTypeAbbrev: ["ЛР", "ЛК"],
      auditory: "101-1"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.subject).toBe("ООП");
  });

  it("handles nullable weekNumber and lessonTypeAbbrev safely", async () => {
    const payload = buildScheduleResponse();
    payload.schedules!.Понедельник![0]!.weekNumber = null;
    payload.schedules!.Понедельник![0]!.lessonTypeAbbrev = null;

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      weekNumber: 1,
      lessonTypeAbbrev: "ЛР"
    });

    expect(filtered).toHaveLength(0);
  });

  it("treats nullish auditories as empty when filtering by auditory", async () => {
    const payload = buildScheduleResponse();
    (payload.schedules!.Понедельник![0] as { auditories: string[] | null }).auditories = null;

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const filtered = await client.schedule.getGroupFiltered("053503", {
      source: "schedules",
      auditory: "101-1"
    });

    expect(filtered).toHaveLength(0);
  });
});
