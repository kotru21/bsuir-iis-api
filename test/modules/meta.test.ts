import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { mockFetchSequence } from "../helpers/fetchMock";

describe("meta modules", () => {
  it("parses current week from plain-text API response", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("1\n", { status: 200, headers: { "Content-Type": "text/plain" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(1);
  });
});
