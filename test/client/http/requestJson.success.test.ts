import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../../src/client/http";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

describe("requestJson — success and hooks", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { hello: "world" } })]);
    const config = createRequestJsonConfig(fetchImpl);

    const response = await requestJson<{ hello: string }>(config, "/faculties");

    expect(response.hello).toBe("world");
  });

  it("emits request/response hooks for successful request", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { ok: true } })]);
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const config = createRequestJsonConfig(fetchImpl, {
      hooks: { onRequest, onResponse }
    });

    await requestJson<{ ok: boolean }>(config, "/faculties", {
      query: { lang: "ru" }
    });

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/faculties",
        attempt: 1,
        fromCache: false,
        status: 200
      })
    );
  });

  it("parses JSON success body even when Content-Type omits application/json", async () => {
    const fetchImpl = mockFetchSequence([
      Response.json(
        { ok: true },
        {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        }
      )
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("returns null when success body is empty and Content-Type is not JSON", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    const body = await requestJson<null>(config, "/faculties");
    expect(body).toBeNull();
  });
});
