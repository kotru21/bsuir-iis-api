import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../../src";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";
import { BsuirNetworkError } from "../../../src/client/errors";

describe("requestJson — inFlightRequests cleanup", () => {
  it("removes inFlightRequests entry when the request fails so subsequent calls retry", async () => {
    const fetchImpl = mockFetchSequence([
      new Error("boom"),
      createJsonResponse({ body: [] })
    ]) as unknown as typeof fetch;

    const client = createBsuirClient({ fetch: fetchImpl, dedupeInFlight: true, retries: 0 });

    // First call fails (wrapped as BsuirNetworkError)
    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirNetworkError);

    // After failure, subsequent call should trigger another network request
    await expect(client.groups.listAll()).resolves.toEqual([]);

    expect((fetchImpl as any).mock.calls.length).toBe(2);
  });
});
