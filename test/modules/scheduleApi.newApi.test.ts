import { describe, expect, it, vi } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse } from "../helpers/fetchMock";

describe("schedule module — explicit raw/envelope API", () => {
  it("getGroupRaw returns raw envelope with schedules field", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        body: {
          employeeDto: null,
          studentGroupDto: null,
          schedules: {},
          exams: [],
          startDate: null,
          endDate: null,
          startExamsDate: null,
          endExamsDate: null
        }
      })
    ) as unknown as typeof fetch;

    const client = createBsuirClient({ fetch: fetchImpl });
    const raw = await client.schedule.getGroupRaw("053503");
    expect(raw).toHaveProperty("schedules");
  });

  it("getGroupBySubgroupEnvelope filters subgroup and returns ScheduleResponse envelope", async () => {
    const body = {
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Понедельник: [
          { numSubgroup: 1, name: "A" },
          { numSubgroup: 2, name: "B" }
        ]
      },
      exams: [],
      startDate: null,
      endDate: null,
      startExamsDate: null,
      endExamsDate: null
    };
    const fetchImpl = vi.fn(async () => createJsonResponse({ body })) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });

    const envelope = await client.schedule.getGroupBySubgroupEnvelope("053503", 2);
    expect(envelope).toHaveProperty("schedules");
    expect(envelope.schedules?.Понедельник).toHaveLength(1);
    expect(envelope.schedules?.Понедельник?.[0]?.numSubgroup).toBe(2);
  });

  it("getEmployeeBySubgroupEnvelope filters subgroup and returns ScheduleResponse envelope", async () => {
    const body = {
      employeeDto: null,
      studentGroupDto: null,
      schedules: {
        Вторник: [
          { numSubgroup: 1, name: "A" },
          { numSubgroup: 2, name: "B" }
        ]
      },
      exams: [],
      startDate: null,
      endDate: null,
      startExamsDate: null,
      endExamsDate: null
    };
    const fetchImpl = vi.fn(async () => createJsonResponse({ body })) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });

    const envelope = await client.schedule.getEmployeeBySubgroupEnvelope("s-nesterenkov", 2);
    expect(envelope).toHaveProperty("schedules");
    expect(envelope.schedules?.Вторник).toHaveLength(1);
    expect(envelope.schedules?.Вторник?.[0]?.numSubgroup).toBe(2);
  });
});
