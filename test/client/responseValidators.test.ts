import { describe, expect, it } from "vitest";
import {
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

  it("accepts valid api date payload", () => {
    expect(() => assertApiDateResponse({ lastUpdateDate: "23.02.2022" }, "/date")).not.toThrow();
  });

  it("rejects invalid api date payload", () => {
    expect(() => assertApiDateResponse({ lastUpdateDate: 123 }, "/date")).toThrow(
      BsuirResponseValidationError
    );
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
        {
          employeeDto: null,
          studentGroupDto: null,
          schedules: [],
          exams: []
        },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("rejects invalid exams shape", () => {
    expect(() =>
      assertScheduleResponse(
        {
          employeeDto: null,
          studentGroupDto: null,
          schedules: {},
          exams: {}
        },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });

  it("rejects invalid nullable dto fields", () => {
    expect(() =>
      assertScheduleResponse(
        {
          employeeDto: 5,
          studentGroupDto: null,
          schedules: {},
          exams: []
        },
        "/schedule"
      )
    ).toThrow(BsuirResponseValidationError);
  });
});
