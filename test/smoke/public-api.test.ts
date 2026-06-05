import { describe, expect, it } from "vitest";
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
    expect(client).toHaveProperty("cache");
    expect(client.cache.clear()).toBeUndefined();
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

  it("exposes cache invalidation controls", async () => {
    const fetchImpl = (async () => Response.json([{ id: 1 }], { status: 200 })) as typeof fetch;
    const client = createBsuirClient({
      fetch: fetchImpl,
      cache: { ttlMs: 60_000 }
    });

    await client.groups.listAll();
    expect(client.cache.delete("/student-groups")).toBe(true);
    expect(client.cache.delete("/student-groups")).toBe(false);
  });
});
