import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("meta modules", () => {
  it("parses current week from plain-text API response", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("1\n", { status: 200, headers: { "Content-Type": "text/plain" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.currentWeek.get();
    expect(week).toBe(1);
  });

  it("gets current week and last updates", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: 2 }),
      createJsonResponse({ body: 2 }),
      createJsonResponse({ body: 3 }),
      createJsonResponse({ body: { lastUpdateDate: "23.02.2022" } }),
      createJsonResponse({ body: { lastUpdateDate: "24.02.2022" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.currentWeek.get();
    const cycleWeek = await client.currentWeek.getCycle();
    const customCycleWeek = await client.currentWeek.getCycle({ weeksPerCycle: 1 });
    const groupUpdate = await client.lastUpdate.byGroup({ id: 123 });
    const employeeUpdate = await client.lastUpdate.byEmployee({ urlId: "s-nesterenkov" });

    expect(week).toBe(2);
    expect(cycleWeek).toBe(1);
    expect(customCycleWeek).toBe(3);
    expect(groupUpdate.lastUpdateDate).toBe("23.02.2022");
    expect(employeeUpdate.lastUpdateDate).toBe("24.02.2022");
  });

  it("validates last update params", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    await expect(client.lastUpdate.byGroup({ id: 0 })).rejects.toBeInstanceOf(BsuirValidationError);
    await expect(client.lastUpdate.byEmployee({ urlId: "" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
  });
});
