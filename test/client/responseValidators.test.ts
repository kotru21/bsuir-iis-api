import { describe, expect, it } from "vitest";
import {
  assertAnnouncementListResponse,
  assertApiDateResponse,
  assertArrayResponse,
  assertScheduleResponse
} from "../../src/client/responseValidators";
import { BsuirResponseValidationError } from "../../src/client/errors";

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

  it("accepts valid api date payload", () => {
    expect(() => assertApiDateResponse({ lastUpdateDate: "23.02.2022" }, "/date")).not.toThrow();
  });

  it("rejects invalid api date payload", () => {
    expect(() => assertApiDateResponse({ lastUpdateDate: 123 }, "/date")).toThrow(
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
});
