import { beforeAll, expect, it } from "vitest";
import { createBsuirClient } from "../../../src";
import { buildScheduleDays, getTodayLessons } from "../../../src";
import { resolveWorkingScheduleEntities, SCHEDULE_PROBE_WARN } from "./fixtures";
import { describeLive } from "./gate";

describeLive("live strict client and schedule helpers", () => {
  const strictClient = createBsuirClient.strict({
    timeoutMs: 15_000,
    retries: 2,
    retryDelayMs: 400,
    retryMaxDelayMs: 2000,
    retryJitter: true
  });

  let groupNumber: string | undefined;
  let scheduleAvailable = false;

  beforeAll(async () => {
    // Same cached probe as schedule.live.test.ts (fixtures module cache).
    const resolved = await resolveWorkingScheduleEntities(strictClient);
    groupNumber = resolved.groupNumber;
    scheduleAvailable = resolved.available;
    if (!scheduleAvailable) {
      console.warn(SCHEDULE_PROBE_WARN);
    }
  }, 60_000);

  it("strict client listAll + getGroup do not throw on live payloads", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber) {
      skip();
      return;
    }

    await expect(strictClient.groups.listAll()).resolves.toEqual(expect.any(Array));
    await expect(strictClient.schedule.getGroup(groupNumber)).resolves.toMatchObject({
      lessons: expect.any(Array),
      schedules: expect.any(Object)
    });
  }, 60_000);

  it("getTodayLessons and buildScheduleDays work on live normalized schedule", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber) {
      skip();
      return;
    }

    const normalized = await strictClient.schedule.getGroup(groupNumber);
    const todayLessons = getTodayLessons(normalized, new Date());
    expect(Array.isArray(todayLessons)).toBe(true);

    const days = buildScheduleDays(normalized, { days: 7 });
    expect(Array.isArray(days)).toBe(true);
    expect(days.length).toBeLessThanOrEqual(7);
    for (const day of days) {
      expect(day).toHaveProperty("dateKey");
      expect(typeof day.dateKey).toBe("string");
    }
  }, 60_000);
});
