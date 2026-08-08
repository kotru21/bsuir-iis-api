import { describe, expect, it } from "vitest";
import { BsuirResponseValidationError, createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("createBsuirClient.strict", () => {
  it("enables validateResponses so invalid catalog payloads throw", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "an-array" } })]);
    const client = createBsuirClient.strict({ fetch: fetchImpl });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("keeps default createBsuirClient validateResponses off", async () => {
    // Array shape is still required; full per-item object checks stay off when validation is off.
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [1, 2, 3] })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(client.groups.listAll()).resolves.toEqual([1, 2, 3]);
  });
});
