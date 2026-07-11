import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirResponseValidationError, BsuirValidationError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("meta modules", () => {
  it("parses current week from plain-text API response", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("1\n", { status: 200, headers: { "Content-Type": "text/plain" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(1);
  });

  it("gets current week and last updates", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: 2 }),
      createJsonResponse({ body: { lastUpdateDate: "23.02.2022" } }),
      createJsonResponse({ body: { lastUpdateDate: "24.02.2022" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.schedule.getCurrentWeek();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
    const groupUpdate = await client.schedule.getLastUpdateByGroup({ id: 123 });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
    const employeeUpdate = await client.schedule.getLastUpdateByEmployee({
      urlId: "s-nesterenkov"
    });

    expect(week).toBe(2);
    expect(groupUpdate.lastUpdateDate).toBe("23.02.2022");
    expect(employeeUpdate.lastUpdateDate).toBe("24.02.2022");
  });

  it("validates last update response shape when validateResponses=true", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { lastUpdateDate: "" } }),
      createJsonResponse({ body: { wrong: true } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
    await expect(client.schedule.getLastUpdateByGroup({ id: 123 })).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
      client.schedule.getLastUpdateByEmployee({ urlId: "s-nesterenkov" })
    ).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("validates last update params", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
    await expect(client.schedule.getLastUpdateByGroup({ id: 0 })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
      client.schedule.getLastUpdateByGroup({ groupNumber: "05350A" })
    ).rejects.toBeInstanceOf(BsuirValidationError);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
    await expect(client.schedule.getLastUpdateByEmployee({ urlId: "" })).rejects.toBeInstanceOf(
      BsuirValidationError
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
      client.schedule.getLastUpdateByEmployee({ urlId: "s/nesterenkov" })
    ).rejects.toBeInstanceOf(BsuirValidationError);
  });
});
