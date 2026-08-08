import { describe, expect, it } from "vitest";
import { requestJson } from "../../../src/client/http";
import { BsuirTimeoutError } from "../../../src/client/errors";
import { createJsonResponse } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

describe("requestJson — abort and timeout", () => {
  it("propagates global client signal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return createJsonResponse({ body: { ok: true } });
    }) as typeof globalThis.fetch;
    const config = createRequestJsonConfig(fetchImpl, { signal: controller.signal });

    await expect(requestJson(config, "/faculties")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("throws timeout error when request takes too long", async () => {
    const fetchImpl = (async (_input, init) => {
      const signal = init?.signal;
      await new Promise((_resolve, reject) => {
        const abort = (): void => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        // Guard against rare CI scheduling where AbortSignal.timeout is delayed.
        const guard = setTimeout(abort, 100);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(guard);
            abort();
          },
          { once: true }
        );
      });
      return createJsonResponse({ body: {} });
    }) as typeof globalThis.fetch;

    const config = createRequestJsonConfig(fetchImpl, { timeoutMs: 10 });

    const request = requestJson(config, "/faculties");
    await expect(request).rejects.toBeInstanceOf(BsuirTimeoutError);
    await expect(request).rejects.toMatchObject({
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      timeoutMs: 10
    });
  }, 10_000);

  it("does not retry on timeout even when retries remain", async () => {
    let attempts = 0;
    const fetchImpl = (async (_input, init) => {
      attempts += 1;
      const signal = init?.signal;
      await new Promise((_resolve, reject) => {
        const abort = (): void => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        const guard = setTimeout(abort, 100);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(guard);
            abort();
          },
          { once: true }
        );
      });
      return createJsonResponse({ body: {} });
    }) as typeof globalThis.fetch;

    const config = createRequestJsonConfig(fetchImpl, { timeoutMs: 10, retries: 2 });

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirTimeoutError);
    expect(attempts).toBe(1);
  }, 10_000);

  it("propagates external AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return createJsonResponse({ body: { ok: true } });
    }) as typeof globalThis.fetch;
    const config = createRequestJsonConfig(fetchImpl, { timeoutMs: 5000 });

    await expect(
      requestJson(config, "/faculties", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
