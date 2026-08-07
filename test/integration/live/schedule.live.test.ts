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

  it("normalized getGroup / getEmployee expose lessons + schedules", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupSchedule, employeeSchedule] = await Promise.all([
      client.schedule.getGroup(groupNumber),
      client.schedule.getEmployee(employeeUrlId)
    ]);

    expect(groupSchedule).toHaveProperty("lessons");
    expect(groupSchedule).toHaveProperty("schedules");
    expect(employeeSchedule).toHaveProperty("lessons");
    expect(employeeSchedule).toHaveProperty("schedules");
  }, 60_000);

  it("raw envelopes expose schedules object or null", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupRaw, employeeRaw] = await Promise.all([
      client.schedule.getGroupRaw(groupNumber),
      client.schedule.getEmployeeRaw(employeeUrlId)
    ]);

    expect(groupRaw.schedules === null || typeof groupRaw.schedules === "object").toBe(true);
    expect(employeeRaw.schedules === null || typeof employeeRaw.schedules === "object").toBe(true);
  }, 60_000);

  it("exams and filtered(source: schedules) return arrays", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupExams, employeeExams, groupFiltered, employeeFiltered] = await Promise.all([
      client.schedule.getGroupExams(groupNumber),
      client.schedule.getEmployeeExams(employeeUrlId),
      client.schedule.getGroupFiltered(groupNumber, { source: "schedules" }),
      client.schedule.getEmployeeFiltered(employeeUrlId, { source: "schedules" })
    ]);

    expect(Array.isArray(groupExams)).toBe(true);
    expect(Array.isArray(employeeExams)).toBe(true);
    expect(Array.isArray(groupFiltered)).toBe(true);
    expect(Array.isArray(employeeFiltered)).toBe(true);
  }, 60_000);

  it("subgroup 1 default / raw / envelope shapes", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [
      groupBySubgroup,
      groupBySubgroupRaw,
      groupBySubgroupEnvelope,
      employeeBySubgroup,
      employeeBySubgroupRaw,
      employeeBySubgroupEnvelope
    ] = await Promise.all([
      client.schedule.getGroupBySubgroup(groupNumber, 1),
      client.schedule.getGroupBySubgroupRaw(groupNumber, 1),
      client.schedule.getGroupBySubgroupEnvelope(groupNumber, 1),
      client.schedule.getEmployeeBySubgroup(employeeUrlId, 1),
      client.schedule.getEmployeeBySubgroupRaw(employeeUrlId, 1),
      client.schedule.getEmployeeBySubgroupEnvelope(employeeUrlId, 1)
    ]);

    expect(Array.isArray(groupBySubgroup)).toBe(true);
    expect(Array.isArray(groupBySubgroupRaw)).toBe(true);
    expect(Array.isArray(employeeBySubgroup)).toBe(true);
    expect(Array.isArray(employeeBySubgroupRaw)).toBe(true);
    expect(groupBySubgroupEnvelope).toHaveProperty("schedules");
    expect(employeeBySubgroupEnvelope).toHaveProperty("schedules");
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
