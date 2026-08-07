import { describe, expect, it } from "vitest";
import type { AnnouncementReadOptions, CacheStore, ScheduleReadOptions } from "../../src";
import {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError,
  BsuirResponseValidationError,
  BsuirTimeoutError,
  BsuirValidationError,
  buildScheduleDays,
  createBsuirClient,
  filterLessons,
  formatEmployeeShortName,
  formatLessonAuditories,
  formatLessonEmployees,
  formatLessonSubgroup,
  formatLessonTimeRange,
  formatLessonType,
  formatLessonWeekNumbers,
  getTodayLessons,
  normalizeSchedule
} from "../../src";

describe("public api", () => {
  it("exports createBsuirClient and error classes", () => {
    const client = createBsuirClient({
      fetch: (async () => Response.json(2, { status: 200 })) as typeof fetch
    });

    expect(client).toHaveProperty("schedule");
    expect(BsuirApiError).toBeDefined();
    expect(BsuirConfigurationError).toBeDefined();
    expect(BsuirNetworkError).toBeDefined();
    expect(BsuirResponseValidationError).toBeDefined();
    expect(BsuirTimeoutError).toBeDefined();
    expect(BsuirValidationError).toBeDefined();
    expect(normalizeSchedule).toBeDefined();
    expect(filterLessons).toBeDefined();
    expect(getTodayLessons).toBeDefined();
    expect(buildScheduleDays).toBeDefined();
  });

  it("exports AnnouncementReadOptions as a public type", () => {
    const options: AnnouncementReadOptions = { treat404AsEmpty: false };
    expect(options.treat404AsEmpty).toBe(false);
  });

  it("exports ScheduleReadOptions as a public type", () => {
    const options: ScheduleReadOptions = { includeNextSchedules: true };
    expect(options.includeNextSchedules).toBe(true);
  });

  it("exports format helpers", () => {
    expect(
      formatEmployeeShortName({ lastName: "Иванов", firstName: "Иван", middleName: "Иванович" })
    ).toBe("Иванов И.И.");
    expect(formatLessonTimeRange({ startLessonTime: "09:00", endLessonTime: "10:20" })).toBe(
      "09:00–10:20"
    );
    expect(formatLessonType({ lessonTypeAbbrev: "ЛК" })).toBe("ЛК");
    expect(formatLessonSubgroup({ numSubgroup: 1 })).toBe("1 подгруппа");
    expect(formatLessonWeekNumbers({ weekNumber: [1, 2] })).toBe("1, 2 нед.");
    expect(formatLessonAuditories({ auditories: ["101-1"] })).toBe("101-1");
    expect(formatLessonEmployees({ employees: null })).toBe("");
  });

  it("exports createBsuirClient.strict", () => {
    expect(typeof createBsuirClient.strict).toBe("function");
  });

  it("exports CacheStore as a public type and accepts a plain Map", () => {
    const store: CacheStore = new Map();
    expect(store.size).toBe(0);
  });

  it("exports BsuirResponsePayloadTooLargeError", () => {
    const err = new BsuirResponsePayloadTooLargeError("too large", 200, "/student-groups", 1024);
    expect(err).toBeInstanceOf(BsuirResponsePayloadTooLargeError);
    expect(err.maxResponseBytes).toBe(1024);
  });

  it("does not expose removed 2.0 last-update helpers", () => {
    const client = createBsuirClient({
      fetch: (async () => Response.json(2, { status: 200 })) as typeof fetch
    });

    expect(client.schedule).not.toHaveProperty("getLastUpdateByGroup");
    expect(client.schedule).not.toHaveProperty("getLastUpdateByEmployee");
  });
});
