import { describe, expect, it } from "vitest";
import type { AnnouncementReadOptions } from "../../src";
import {
  BsuirApiError,
  BsuirConfigurationError,
  BsuirNetworkError,
  BsuirResponseValidationError,
  BsuirTimeoutError,
  BsuirValidationError,
  buildScheduleDays,
  createBsuirClient,
  filterLessons,
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
});
