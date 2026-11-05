import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import { buildScheduleResponse } from "./scheduleFixtures";

describe("schedule module — input validation", () => {
  it("throws on invalid group number", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.schedule.get({ group: "" })).rejects.toBeInstanceOf(BsuirValidationError);
    await expect(client.schedule.get({ group: "05350A" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
  });

  it("throws on invalid group number in raw helper", async () => {
    const fetchImpl = mockFetchSequence([]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(client.schedule.getRaw({ group: "05350A" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on invalid employee urlId format", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.schedule.get({ employee: "" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    await expect(client.schedule.get({ employee: "s/nesterenkov" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
  });

  it("throws on invalid employee urlId in raw helper", async () => {
    const fetchImpl = mockFetchSequence([]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(client.schedule.getRaw({ employee: "s/nesterenkov" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on invalid subgroup filter without requesting", async () => {
    const fetchImpl = mockFetchSequence([]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(
      client.schedule.get({ group: "053503" }, { filter: { subgroup: 0 } })
    ).rejects.toBeInstanceOf(BsuirValidationError);
    await expect(
      client.schedule.get({ employee: "s-nesterenkov" }, { filter: { subgroup: -1 } })
    ).rejects.toBeInstanceOf(BsuirValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-positive filter.weekNumber", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(
      client.schedule.get({ group: "053503" }, { filter: { weekNumber: 0 } })
    ).rejects.toMatchObject({ field: "filter.weekNumber" });
  });
});
