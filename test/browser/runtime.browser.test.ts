import { describe, expect, it } from "vitest";
import { BsuirTimeoutError, createBsuirClient } from "../../src";

describe("browser runtime smoke", () => {
  it("uses browser fetch and maps timeout-style aborts", async () => {
    const fetchImpl = (async (_input, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("The operation timed out", "TimeoutError");
    }) as typeof fetch;
    const client = createBsuirClient({
      fetch: fetchImpl,
      retries: 0,
      timeoutMs: 10
    });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirTimeoutError);
  });
});
