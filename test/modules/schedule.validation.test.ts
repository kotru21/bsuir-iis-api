import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import { buildScheduleResponse } from "./scheduleFixtures";

describe("schedule module — input validation", () => {
  it("throws on invalid group number", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.schedule.getGroup("")).rejects.toBeInstanceOf(BsuirValidationError);
    await expect(client.schedule.getGroup("05350A")).rejects.toBeInstanceOf(BsuirValidationError);
  });

  it("throws on invalid group number in raw helper", async () => {
    const fetchImpl = mockFetchSequence([]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(client.schedule.getGroupRaw("05350A")).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on invalid employee urlId format", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.schedule.getEmployee("")).rejects.toBeInstanceOf(BsuirValidationError);
    await expect(client.schedule.getEmployee("s/nesterenkov")).rejects.toBeInstanceOf(
      BsuirValidationError
    );
  });

  it("throws on invalid employee urlId in raw helper", async () => {
    const fetchImpl = mockFetchSequence([]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(client.schedule.getEmployeeRaw("s/nesterenkov")).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on invalid subgroup in subgroup helpers", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.schedule.getGroupBySubgroup("053503", 0)).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    await expect(client.schedule.getEmployeeBySubgroup("s-nesterenkov", -1)).rejects.toBeInstanceOf(
      BsuirValidationError
    );
  });

  it("rejects non-positive subgroup in getGroupFiltered", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(
      client.schedule.getGroupFiltered("053503", { subgroup: 0 })
    ).rejects.toBeInstanceOf(BsuirValidationError);
  });
});
