import { describe, expect, it, vi } from "vitest";
import {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirResponseValidationError,
  BsuirTimeoutError,
  BsuirValidationError,
  buildScheduleDays,
  getStudyWeek
} from "../../src";

describe("error classes", () => {
  it("does not call Object.setPrototypeOf for Error subclasses", () => {
    const spy = vi.spyOn(Object, "setPrototypeOf");
    try {
      new BsuirApiError("oops", 500, "endpoint", {});
      new BsuirConfigurationError("bad config");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("derives every SDK error from BsuirError and keeps its own name", () => {
    const errors: Error[] = [
      new BsuirApiError("api", 500, "/x", null),
      new BsuirResponsePayloadTooLargeError("big", 200, "/x", 1),
      new BsuirNetworkError("net", "/x", new TypeError("fetch failed")),
      new BsuirTimeoutError("slow", "/x", 10),
      new BsuirValidationError("input", "field", 1),
      new BsuirResponseValidationError("shape", "/x"),
      new BsuirConfigurationError("config")
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(BsuirError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it("keeps `cause` on transport errors", () => {
    const cause = new TypeError("fetch failed");
    expect(new BsuirNetworkError("net", "/x", cause).cause).toBe(cause);
    expect(new BsuirTimeoutError("slow", "/x", 10, cause).cause).toBe(cause);
  });
});

describe("date argument validation", () => {
  // Regression: invalid dates used to throw a bare TypeError, unlike every other input check.
  it("rejects non-Date and invalid Date arguments with BsuirValidationError", () => {
    expect(() => getStudyWeek("2026-09-01" as unknown as Date)).toThrow(BsuirValidationError);
    expect(() => getStudyWeek(new Date(Number.NaN))).toThrow(BsuirValidationError);

    const error: unknown = (() => {
      try {
        return buildScheduleDays(
          {
            schedules: {},
            exams: [],
            lessons: [],
            lessonsByDay: {
              Понедельник: [],
              Вторник: [],
              Среда: [],
              Четверг: [],
              Пятница: [],
              Суббота: []
            },
            scheduleLessons: [],
            examLessons: [],
            employeeDto: null,
            studentGroupDto: null,
            startDate: null,
            endDate: null,
            startExamsDate: null,
            endExamsDate: null
          },
          { now: new Date("not a date") }
        );
      } catch (error_: unknown) {
        return error_;
      }
    })();
    expect(error).toBeInstanceOf(BsuirValidationError);
    expect((error as BsuirValidationError).field).toBe("options.now");
  });
});
