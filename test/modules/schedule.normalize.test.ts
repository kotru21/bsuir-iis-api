import { describe, expect, it } from "vitest";
import { createBsuirClient, normalizeSchedule } from "../../src";
import { BsuirResponseValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import { buildNextTermMondayLesson, buildScheduleResponse } from "./scheduleFixtures";

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

  it("returns a consistently deep-frozen structure across all views", () => {
    const normalized = normalizeSchedule(buildScheduleResponse());

    expect(Object.isFrozen(normalized.lessons)).toBe(true);
    expect(Object.isFrozen(normalized.scheduleLessons)).toBe(true);
    expect(Object.isFrozen(normalized.examLessons)).toBe(true);
    expect(Object.isFrozen(normalized.lessonsByDay.Понедельник)).toBe(true);
    expect(Object.isFrozen(normalized.schedules)).toBe(true);

    // Items inside the `schedules` map are frozen as deeply as flattened lessons —
    // previously only the flattened views were frozen, leaving these half-mutable.
    const mondayFirst = normalized.schedules.Понедельник?.[0];
    expect(mondayFirst).toBeDefined();
    if (mondayFirst) {
      expect(Object.isFrozen(mondayFirst)).toBe(true);
      expect(mondayFirst.weekNumber && Object.isFrozen(mondayFirst.weekNumber)).toBe(true);
      expect(() => {
        mondayFirst.note = "mutated";
      }).toThrow(TypeError);
      expect(() => {
        mondayFirst.weekNumber?.push(4);
      }).toThrow(TypeError);
    }

    const exam = normalized.exams[0];
    expect(exam).toBeDefined();
    if (exam) {
      expect(Object.isFrozen(exam)).toBe(true);
      expect(Object.isFrozen(exam.auditories)).toBe(true);
    }

    const first = normalized.lessons[0];
    if (first) {
      expect(() => {
        normalized.lessons.push(first);
      }).toThrow(TypeError);
      const employees = first.employees;
      if (Array.isArray(employees)) {
        expect(Object.isFrozen(employees)).toBe(true);
      }
    }
  });

  it("does not freeze or mutate the caller's raw response", () => {
    const response = buildScheduleResponse();
    const normalized = normalizeSchedule(response);

    expect(Object.isFrozen(response)).toBe(false);
    const monday = response.schedules?.Понедельник;
    expect(monday).toBeDefined();
    if (monday) {
      expect(Object.isFrozen(monday)).toBe(false);
      expect(monday[0] && Object.isFrozen(monday[0])).toBe(false);
      expect(monday[0]?.weekNumber && Object.isFrozen(monday[0].weekNumber)).toBe(false);
    }

    // Normalization happens on an owned clone; raw content stays intact and mutable.
    expect(response.schedules?.Понедельник).toHaveLength(1);
    expect(normalized.schedules.Понедельник?.[0]?.auditories).toEqual(["101-1"]);
  });

  it("default normalize excludes nextSchedules from lessons", () => {
    const response = buildScheduleResponse({
      nextSchedules: buildNextTermMondayLesson()
    });
    const normalized = normalizeSchedule(response);

    expect(normalized.lessons.every((lesson) => lesson.subject !== "NEXT")).toBe(true);
    expect(normalized.lessons.every((lesson) => lesson.source !== "nextSchedules")).toBe(true);
    expect(normalized.nextSchedules?.Понедельник?.[0]?.subject).toBe("NEXT");
  });

  it("includeNextSchedules flattens nextSchedules into lessons", () => {
    const response = buildScheduleResponse({
      nextSchedules: buildNextTermMondayLesson()
    });
    const normalized = normalizeSchedule(response, { includeNextSchedules: true });
    const next = normalized.lessons.filter((lesson) => lesson.source === "nextSchedules");

    expect(next).toHaveLength(1);
    expect(next[0]?.subject).toBe("NEXT");
    expect(next[0]?.day).toBe("Понедельник");
    expect(normalized.scheduleLessons.every((lesson) => lesson.source === "schedules")).toBe(true);
    expect(normalized.lessonsByDay.Понедельник.some((lesson) => lesson.subject === "NEXT")).toBe(
      true
    );
  });

  it("getGroup passes includeNextSchedules into normalize", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          nextSchedules: buildNextTermMondayLesson()
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const normalized = await client.schedule.getGroup("053503", { includeNextSchedules: true });

    expect(normalized.lessons.some((lesson) => lesson.source === "nextSchedules")).toBe(true);
  });

  it("throws typed error for non-array weekday buckets when validation is off", () => {
    const response = buildScheduleResponse({
      schedules: {
        Понедельник: null as unknown as []
      }
    });
    // null is treated as empty (same as missing); non-array objects must not TypeError.
    expect(() => normalizeSchedule(response, { validate: false })).not.toThrow();

    const malformed = buildScheduleResponse({
      schedules: {
        Понедельник: { not: "an array" } as unknown as []
      }
    });
    expect(() => normalizeSchedule(malformed, { validate: false })).toThrow(
      BsuirResponseValidationError
    );
  });

  it("getGroup with validateResponses false throws typed error for non-array day bucket", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: {
            Понедельник: "bad" as unknown as []
          }
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroup("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("rejects schedules array envelope instead of silent empty success", () => {
    const response = buildScheduleResponse({
      schedules: [] as unknown as Record<string, never>
    });
    expect(() => normalizeSchedule(response, { validate: false })).toThrow(
      BsuirResponseValidationError
    );
  });

  it("rejects nextSchedules array envelope instead of silent empty success", () => {
    const response = buildScheduleResponse({
      nextSchedules: [] as unknown as Record<string, never>
    });
    expect(() =>
      normalizeSchedule(response, { validate: false, includeNextSchedules: true })
    ).toThrow(BsuirResponseValidationError);
    // Structural map check is always-on, even when nextSchedules are not flattened.
    expect(() => normalizeSchedule(response, { validate: false })).toThrow(
      BsuirResponseValidationError
    );
  });

  it("rejects non-array exams instead of silently dropping them", () => {
    const response = buildScheduleResponse({
      exams: { not: "an array" } as unknown as []
    });
    expect(() => normalizeSchedule(response, { validate: false })).toThrow(
      BsuirResponseValidationError
    );
  });

  it("treats null exams as empty on the always-on path", () => {
    const response = buildScheduleResponse({ exams: null });
    const normalized = normalizeSchedule(response, { validate: false });
    expect(normalized.exams).toEqual([]);
    expect(normalized.examLessons).toEqual([]);
  });

  it("getGroup with validateResponses false rejects schedules array envelope", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          schedules: [] as unknown as Record<string, never>
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroup("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });

  it("getGroup with validateResponses false rejects non-array exams", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          exams: "lost" as unknown as []
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.schedule.getGroup("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
  });
});
