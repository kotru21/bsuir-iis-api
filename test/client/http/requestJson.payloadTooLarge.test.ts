import { describe, expect, it, vi } from "vitest";
import { createBsuirClient } from "../../../src";
import { createJsonResponse } from "../../helpers/fetchMock";
import { BsuirResponsePayloadTooLargeError } from "../../../src/client/errors";

describe("requestJson — payload-too-large should trigger onError", () => {
  it("calls hooks.onError when parseBody throws BsuirResponsePayloadTooLargeError", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({ body: { a: 1 }, headers: { "Content-Length": "1000" } })
    ) as unknown as typeof fetch;

    const onError = vi.fn();
    const client = createBsuirClient({ fetch: fetchImpl, maxResponseBytes: 10, hooks: { onError } });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponsePayloadTooLargeError);

    // Expect onError to be called at least once with the payload-too-large error
    expect(onError).toHaveBeenCalled();
    const calledWith = onError.mock.calls[0][0];
    expect(calledWith.error).toBeInstanceOf(BsuirResponsePayloadTooLargeError);
  });
});
