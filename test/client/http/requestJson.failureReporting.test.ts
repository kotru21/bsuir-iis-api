import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../../src/client/http";
import { BsuirApiError } from "../../../src/client/errors";
import type { ErrorHookContext } from "../../../src/client/types";
import { mockFetchSequence } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("Expected the request to fail");
}

/** Behaves like platform fetch: rejects with `signal.reason`, also when already aborted. */
function hangingFetch(): typeof globalThis.fetch {
  return vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(signal.reason as Error);
          return;
        }
        signal?.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
      })
  ) as unknown as typeof globalThis.fetch;
}

describe("requestJson — caller cancellation with a custom abort reason", () => {
  it.each([
    ["an Error", new Error("user navigated away")],
    ["a string", "cancelled"]
  ])(
    "rejects with the reason (%s) instead of retrying as a network error",
    async (_label, reason) => {
      const controller = new AbortController();
      const fetchImpl = hangingFetch();
      const onRetry = vi.fn();
      const onError = vi.fn<(context: ErrorHookContext) => void>();
      const config = createRequestJsonConfig(fetchImpl, {
        retries: 2,
        hooks: { onRetry, onError }
      });

      const request = requestJson(config, "/faculties", { signal: controller.signal });
      controller.abort(reason);

      await expect(request).rejects.toBe(reason);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0].error).toBe(reason);
    }
  );

  it("stops after a network-error backoff without announcing another attempt", async () => {
    const controller = new AbortController();
    const fetchImpl = mockFetchSequence([new TypeError("fetch failed")]);
    const onRequest = vi.fn();
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 2,
      retryDelayMs: 5000,
      retryMaxDelayMs: 5000,
      hooks: {
        onRequest,
        onError,
        onRetry: () => {
          setTimeout(() => controller.abort(new Error("stop")), 5);
        }
      }
    });

    await expect(requestJson(config, "/faculties", { signal: controller.signal })).rejects.toThrow(
      "stop"
    );
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 });
  });
});

describe("requestJson — onError reporting", () => {
  it("reports invalid JSON on a 2xx response exactly once, with the request endpoint", async () => {
    // `new Response()` has an empty `url`, like many custom fetch implementations.
    const fetchImpl = mockFetchSequence([
      new Response("{", { status: 200, headers: { "Content-Type": "application/json" } })
    ]);
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const config = createRequestJsonConfig(fetchImpl, { hooks: { onError } });

    const error = await captureError(requestJson(config, "/faculties"));

    expect(error).toBeInstanceOf(BsuirApiError);
    expect(error).toMatchObject({ endpoint: "https://iis.bsuir.by/api/v1/faculties" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toBe(error);
  });

  it("reports a non-2xx response exactly once", async () => {
    const fetchImpl = mockFetchSequence([new Response("gone", { status: 404 })]);
    const onError = vi.fn();
    const config = createRequestJsonConfig(fetchImpl, { hooks: { onError } });

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirApiError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("requestJson — error message size", () => {
  it("keeps a one-line preview of large text bodies in the message and the full body in `body`", async () => {
    const html = `<html>\n<body>\n${"x".repeat(200_000)}\n</body>\n</html>`;
    const fetchImpl = mockFetchSequence([
      new Response(html, { status: 502, headers: { "Content-Type": "text/html" } })
    ]);
    const config = createRequestJsonConfig(fetchImpl);

    const error = (await captureError(requestJson(config, "/faculties"))) as BsuirApiError;

    expect(error.message.length).toBeLessThan(500);
    expect(error.message).not.toContain("\n");
    expect(error.message).toMatch(
      /^BSUIR API returned HTTP 502 for GET \/faculties: <html> <body> x+… \(\d+ chars\)$/
    );
    expect(error.body).toBe(html);
  });

  it("keeps short text bodies verbatim", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("Расписание временно недоступно", { status: 503 })
    ]);
    const config = createRequestJsonConfig(fetchImpl);

    await expect(requestJson(config, "/faculties")).rejects.toThrow(
      "BSUIR API returned HTTP 503 for GET /faculties: Расписание временно недоступно"
    );
  });
});
