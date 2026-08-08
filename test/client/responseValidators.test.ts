import { describe, expect, it } from "vitest";
import {
  assertAnnouncementListResponse,
  assertArrayResponse,
  assertScheduleResponse,
  assertScheduleStructuralEnvelope
} from "../../src/client/responseValidators";
import { BsuirResponseValidationError } from "../../src/client/errors";
import { buildScheduleResponse } from "../modules/scheduleFixtures";

describe("response validators", () => {
  it("accepts array payloads", () => {
    expect(() => assertArrayResponse([], "/x")).not.toThrow();
  });

  it("rejects non-array payloads", () => {
    expect(() => assertArrayResponse({}, "/x")).toThrow(BsuirResponseValidationError);
  });

  // line 7 — assertArrayResponse: non-array but object (not null/primitive)
  it("rejects null payload in assertArrayResponse", () => {
    expect(() => assertArrayResponse(null, "/x")).toThrow(BsuirResponseValidationError);
    expect(() => assertArrayResponse("string", "/x")).toThrow(BsuirResponseValidationError);
    expect(() => assertArrayResponse(42, "/x")).toThrow(BsuirResponseValidationError);
  });

  it("accepts announcement list array payloads", () => {
    expect(() => assertAnnouncementListResponse([], "/announcements")).not.toThrow();
  });

  it("accepts paginated announcement envelope", () => {
    expect(() =>
      assertAnnouncementListResponse({ content: [{ id: 1 }], totalElements: 1 }, "/announcements")
    ).not.toThrow();
  });

  it("rejects invalid announcement list payloads", () => {
    expect(() => assertAnnouncementListResponse({}, "/announcements")).toThrow(
      BsuirResponseValidationError
    );
    expect(() => assertAnnouncementListResponse({ content: "nope" }, "/announcements")).toThrow(
      BsuirResponseValidationError
    );
  });

  // line 15 — ensureRecord: payload is array → asRecord returns null → throws
  it("rejects array payload in assertScheduleResponse (ensureRecord, line 15)", () => {
    expect(() => assertScheduleResponse([], "/schedule")).toThrow(BsuirResponseValidationError);
    expect(() => assertScheduleResponse(null, "/schedule")).toThrow(BsuirResponseValidationError);
    expect(() => assertScheduleResponse("text", "/schedule")).toThrow(BsuirResponseValidationError);
  });

  it("accepts valid schedule response shape", () => {
    expect(() =>
      assertScheduleResponse(
        {
          employeeDto: null,
          studentGroupDto: null,
          schedules: {},
          exams: [],
          startDate: null,
          endDate: null,
          startExamsDate: null,
          endExamsDate: null
        },
        "/schedule"
      )
    ).not.toThrow();
  });

  it("rejects invalid schedules shape", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: null, studentGroupDto: null, schedules: [], exams: [] },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("structural envelope rejects non-array day buckets without item checks", () => {
    expect(() =>
      assertScheduleStructuralEnvelope(
        {
          schedules: { Понедельник: "bad" },
          exams: []
        },
        "/schedule"
      )
    ).toThrow(/schedules\.Понедельник/);

    // Wrong lesson field types are deep-only; structural allows them.
    expect(() =>
      assertScheduleStructuralEnvelope(
        {
          schedules: { Понедельник: [{ numSubgroup: "0" }] },
          exams: []
        },
        "/schedule"
      )
    ).not.toThrow();
  });

  it("rejects invalid exams shape", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: null, studentGroupDto: null, schedules: {}, exams: {} },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("rejects invalid nullable dto fields", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: 5, studentGroupDto: null, schedules: {}, exams: [] },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  // line 88 — isNullableObject: studentGroupDto is array → false → throws
  it("rejects array studentGroupDto (isNullableObject, line 88)", () => {
    expect(() =>
      assertScheduleResponse(
        { employeeDto: null, studentGroupDto: [], schedules: {}, exams: [] },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("rejects catalog arrays with non-object elements", () => {
    expect(() => assertArrayResponse([1, 2], "/student-groups")).toThrow(
      BsuirResponseValidationError
    );
    expect(() => assertArrayResponse([null], "/student-groups")).toThrow(
      BsuirResponseValidationError
    );
    expect(() => assertArrayResponse([{ id: 1 }], "/student-groups")).not.toThrow();
  });

  it("rejects announcement items with wrong field types", () => {
    expect(() =>
      assertAnnouncementListResponse([{ id: "x", content: "c", date: "d" }], "/announcements")
    ).toThrow(BsuirResponseValidationError);
    expect(() =>
      assertAnnouncementListResponse(
        [{ id: 1, content: "c", date: "d", employeeDepartments: [1] }],
        "/announcements"
      )
    ).toThrow(BsuirResponseValidationError);
    expect(() =>
      assertAnnouncementListResponse(
        { content: [{ id: 1, studentGroups: "nope" }] },
        "/announcements"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("accepts announcement items with omitted fields (validate-when-present)", () => {
    expect(() => assertAnnouncementListResponse([{ id: 1 }], "/announcements")).not.toThrow();
  });
});

describe("response validators — schedule item level", () => {
  it("accepts a fully populated schedule payload", () => {
    expect(() => assertScheduleResponse(buildScheduleResponse(), "/schedule")).not.toThrow();
  });

  it("rejects lesson with non-array weekNumber", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { weekNumber: unknown }).weekNumber = "1";
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/weekNumber/);
  });

  it("rejects lesson with non-string auditories element", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { auditories: unknown }).auditories = [101];
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/auditories\[0\]/);
  });

  it("rejects lesson with wrong scalar field types", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { numSubgroup: unknown }).numSubgroup = "0";
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/numSubgroup/);
  });

  it("rejects lesson with non-object employees element", () => {
    const payload = buildScheduleResponse();
    const lesson = payload.schedules?.Понедельник?.[0];
    if (lesson) {
      (lesson as { employees: unknown }).employees = [null];
    }
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/employees\[0\]/);
  });

  it("rejects malformed exam items with location in message", () => {
    const payload = buildScheduleResponse();
    (payload.exams as unknown[])[0] = { announcement: "yes" };
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/exams\[0\]\.announcement/);
  });

  it("rejects malformed nextSchedules map values", () => {
    const payload = buildScheduleResponse();
    (payload as { nextSchedules?: unknown }).nextSchedules = { Понедельник: "nope" };
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(
      /nextSchedules\.Понедельник/
    );
  });

  it("rejects non-object schedule day items", () => {
    const payload = buildScheduleResponse();
    (payload.schedules as unknown as Record<string, unknown>).Среда = [null];
    expect(() => assertScheduleResponse(payload, "/schedule")).toThrow(/schedules\.Среда\[0\]/);
  });
});
