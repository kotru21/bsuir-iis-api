import { describe, expect, it } from "vitest";
import { BsuirTimeoutError, createBsuirClient } from "../../src";

describe("browser — caller abort propagation", () => {
  it("rethrows native DOMException when per-call signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const client = createBsuirClient({
      fetch: fetchImpl,
      retries: 0,
      timeoutMs: 5000,
      validateResponses: false
    });

    await expect(client.groups.listAll({ signal: controller.signal })).rejects.toBeInstanceOf(
      DOMException
    );
    await expect(client.groups.listAll({ signal: controller.signal })).rejects.not.toBeInstanceOf(
      BsuirTimeoutError
    );
  });

  it("rethrows native DOMException when global client signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const client = createBsuirClient({
      fetch: fetchImpl,
      signal: controller.signal,
      retries: 0,
      validateResponses: false
    });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(DOMException);
  });
});
