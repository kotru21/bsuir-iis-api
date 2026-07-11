import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import { buildScheduleResponse } from "./scheduleFixtures";

describe("schedule module — normalize and raw", () => {
  it("returns normalized schedule by default", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const response = await client.schedule.getGroup("053503");

    expect("lessons" in response).toBe(true);
    if ("lessons" in response) {
      expect(response.lessons).toHaveLength(3);
      expect(response.scheduleLessons).toHaveLength(2);
      expect(response.examLessons).toHaveLength(1);
      expect(response.lessonsByDay.Понедельник).toHaveLength(1);
      expect(response.lessonsByDay.Среда).toHaveLength(1);
      expect(response.lessons[2]?.source).toBe("exams");
      expect(response.lessons[2]?.day).toBeNull();
    }
  });

  it("freezes normalized lesson items to avoid cross-view mutations", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

    const response = await client.schedule.getGroup("053503");

    expect("lessons" in response).toBe(true);
    if ("lessons" in response) {
      const lesson = response.lessons[0];
      expect(Object.isFrozen(lesson)).toBe(true);
      expect(Object.isFrozen(lesson?.auditories ?? [])).toBe(true);
      expect(Object.isFrozen(response.lessonsByDay.Понедельник[0])).toBe(true);
      expect(Object.isFrozen(response.scheduleLessons[0])).toBe(true);
    }
  });

  it("supports raw mode per request", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const response = await client.schedule.getGroupRaw("053503");

    expect("lessons" in response).toBe(false);
    expect(response.exams).toHaveLength(1);
  });

  it("handles employee schedule where lesson employees can be null", async () => {
    const payload = buildScheduleResponse({ employeeDto: null });
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const response = await client.schedule.getEmployee("s-nesterenkov");
    expect("lessons" in response && response.lessons.some((item) => item.employees === null)).toBe(
      true
    );
  });

  it("handles schedules=null in raw response and normalizes safely", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: null,
          exams: []
        })
      }),
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: null,
          exams: []
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const raw = await client.schedule.getGroupRaw("053503");
    const normalized = await client.schedule.getGroup("053503");

    expect(raw.schedules).toBeNull();
    expect(normalized.schedules).toEqual({});
    expect(normalized.lessons).toEqual([]);
  });

  it("handles missing exams field in raw payload gracefully", async () => {
    const payload = buildScheduleResponse() as unknown as { exams?: unknown };
    delete payload.exams;

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const normalized = await client.schedule.getGroup("053503");
    expect(normalized.exams).toEqual([]);
    expect(normalized.examLessons).toEqual([]);
  });

  it("returns empty normalized arrays for empty schedules", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: {},
          exams: []
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const response = await client.schedule.getGroup("053503");
    expect(response.lessons).toHaveLength(0);
    expect(response.scheduleLessons).toHaveLength(0);
    expect(response.examLessons).toHaveLength(0);
  });

  it("returns normalized schedule structures that do not alias raw payload arrays", async () => {
    const payload = buildScheduleResponse();
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: payload })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const normalized = await client.schedule.getGroup("053503");
    normalized.schedules.Понедельник?.push({
      weekNumber: [1],
      studentGroups: [],
      numSubgroup: 9,
      auditories: [],
      startLessonTime: "20:00",
      endLessonTime: "21:20",
      subject: "tmp",
      subjectFullName: "tmp",
      note: null,
      lessonTypeAbbrev: null,
      dateLesson: null,
      startLessonDate: null,
      endLessonDate: null,
      announcement: false,
      split: false,
      employees: null
    });

    const employees = normalized.lessons[0]?.employees;
    if (Array.isArray(employees)) {
      expect(() =>
        employees.push({
          firstName: "New",
          lastName: "Teacher",
          middleName: "",
          degree: "",
          degreeAbbrev: "",
          email: null,
          rank: null,
          photoLink: "",
          calendarId: "",
          id: 1,
          urlId: "new-teacher",
          jobPositions: null
        })
      ).toThrow(TypeError);
    }

    expect(payload.schedules?.Понедельник).toHaveLength(1);
    expect(payload.schedules?.Понедельник?.[0]?.employees).toHaveLength(1);
  });
});
