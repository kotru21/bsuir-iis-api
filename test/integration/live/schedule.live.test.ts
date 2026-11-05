import { beforeAll, expect, it } from "vitest";
import { createLiveClient } from "./client";
import { resolveWorkingScheduleEntities, SCHEDULE_PROBE_WARN } from "./fixtures";
import { describeLive } from "./gate";

describeLive("live schedule contract", () => {
  const client = createLiveClient();
  let groupNumber: string | undefined;
  let employeeUrlId: string | undefined;
  let scheduleAvailable = false;

  beforeAll(async () => {
    const resolved = await resolveWorkingScheduleEntities(client);
    groupNumber = resolved.groupNumber;
    employeeUrlId = resolved.employeeUrlId;
    scheduleAvailable = resolved.available;
    if (!scheduleAvailable) {
      console.warn(SCHEDULE_PROBE_WARN);
    }
  }, 60_000);

  it("normalized get({ group | employee }) exposes lessons + schedules", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupSchedule, employeeSchedule] = await Promise.all([
      client.schedule.get({ group: groupNumber }),
      client.schedule.get({ employee: employeeUrlId })
    ]);

    expect(groupSchedule).toHaveProperty("lessons");
    expect(groupSchedule).toHaveProperty("schedules");
    expect(employeeSchedule).toHaveProperty("lessons");
    expect(employeeSchedule).toHaveProperty("schedules");
    const groupHasCurrentOrNext =
      groupSchedule.lessons.length > 0 ||
      Object.values(groupSchedule.nextSchedules ?? {}).some(
        (day) => Array.isArray(day) && day.length > 0
      );
    expect(groupHasCurrentOrNext).toBe(true);
  }, 60_000);

  it("raw envelopes expose schedules object or null", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupRaw, employeeRaw] = await Promise.all([
      client.schedule.getRaw({ group: groupNumber }),
      client.schedule.getRaw({ employee: employeeUrlId })
    ]);

    expect(groupRaw.schedules === null || typeof groupRaw.schedules === "object").toBe(true);
    expect(employeeRaw.schedules === null || typeof employeeRaw.schedules === "object").toBe(true);
  }, 60_000);

  it("filter narrows every view consistently (source / subgroup)", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupFull, groupExams, groupSub1, employeeSub1] = await Promise.all([
      client.schedule.get({ group: groupNumber }),
      client.schedule.get({ group: groupNumber }, { filter: { source: "exams" } }),
      client.schedule.get({ group: groupNumber }, { filter: { subgroup: 1 } }),
      client.schedule.get({ employee: employeeUrlId }, { filter: { subgroup: 1 } })
    ]);

    expect(groupExams.lessons).toEqual(groupFull.examLessons);
    expect(groupExams.scheduleLessons).toEqual([]);
    for (const schedule of [groupSub1, employeeSub1]) {
      expect(schedule.lessons.every((l) => l.numSubgroup === 0 || l.numSubgroup === 1)).toBe(true);
      const mapLessons = Object.values(schedule.schedules).flat();
      expect(mapLessons.length).toBe(schedule.scheduleLessons.length);
    }
    expect(groupSub1.lessons.length).toBeLessThanOrEqual(groupFull.lessons.length);
  }, 60_000);

  it("getCurrentWeek returns a number", async ({ skip }) => {
    if (!scheduleAvailable) {
      skip();
      return;
    }

    const currentWeek = await client.schedule.getCurrentWeek();
    expect(currentWeek).toEqual(expect.any(Number));
  }, 60_000);
});
