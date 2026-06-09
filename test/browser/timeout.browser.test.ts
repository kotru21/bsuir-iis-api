import { describe, expect, it } from "vitest";
import { BsuirTimeoutError, createBsuirClient } from "../../src";
import { createSignalAwareFetch } from "./helpers/signalAwareFetch";

describe("browser — request timeout", () => {
  it("maps internal timeout to BsuirTimeoutError via real AbortSignal", async () => {
    const fetchImpl = createSignalAwareFetch();
    const client = createBsuirClient({
      fetch: fetchImpl,
      retries: 0,
      timeoutMs: 50,
      validateResponses: false
    });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirTimeoutError);
  });

  it("passes a real AbortSignal to fetch", async () => {
    let receivedSignal: AbortSignal | undefined;
    const fetchImpl = (async (_input, init) => {
      receivedSignal = init?.signal ?? undefined;
      throw new DOMException("The operation timed out", "TimeoutError");
    }) as typeof fetch;

    const client = createBsuirClient({
      fetch: fetchImpl,
      retries: 0,
      timeoutMs: 10,
      validateResponses: false
    });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirTimeoutError);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
