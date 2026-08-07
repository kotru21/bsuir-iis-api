import { describe, expect, it } from "vitest";
import { requestJson } from "../../../src/client/http";
import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirResponsePayloadTooLargeError
} from "../../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

describe("requestJson — response and transport errors", () => {
  it("throws BsuirApiError when Content-Type is JSON but success body is empty", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("throws BsuirApiError when JSON Content-Type body is not valid JSON", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    let error: unknown;
    try {
      await requestJson(config, "/faculties");
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(BsuirApiError);
    expect(error).toMatchObject({
      message: "Invalid JSON response payload",
      status: 200,
      body: null
    });
  });

  it("throws BsuirResponsePayloadTooLargeError when response body exceeds configured maxResponseBytes", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("payload-that-is-way-too-large", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": "29"
        }
      })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0, maxResponseBytes: 10 });

    let error: unknown;
    try {
      await requestJson(config, "/faculties");
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(BsuirResponsePayloadTooLargeError);
    expect(error).toMatchObject({
      message: "Response body exceeds maxResponseBytes limit (10 bytes)"
    });
  });

  it("throws BsuirApiError for non-2xx response", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 500, body: { message: "Server error" } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    const request = requestJson(config, "/faculties");
    await expect(request).rejects.toBeInstanceOf(BsuirApiError);
    await expect(request).rejects.toMatchObject({
      status: 500,
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      body: { message: "Server error" }
    });
  });

  it("preserves IIS plain-text body on non-2xx even when Content-Type claims JSON", async () => {
    const seasonal = "Сервис временно недоступен. Работа ИИС возобновится после 15 августа.";
    const fetchImpl = mockFetchSequence([
      new Response(seasonal, {
        status: 503,
        headers: { "Content-Type": "application/json" }
      })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    let error: unknown;
    try {
      await requestJson(config, "/faculties");
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(BsuirApiError);
    expect(error).toMatchObject({
      status: 503,
      body: seasonal
    });
    expect((error as BsuirApiError).message).toContain(seasonal);
    expect((error as BsuirApiError).message).not.toBe("Invalid JSON response payload");
  });

  it("throws BsuirNetworkError on exhausted retries", async () => {
    const transportError = new Error("ECONNRESET");
    const fetchImpl = mockFetchSequence([transportError]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 0 });

    const request = requestJson(config, "/faculties");
    await expect(request).rejects.toBeInstanceOf(BsuirNetworkError);
    await expect(request).rejects.toMatchObject({
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      cause: transportError
    });
  });

  it("throws BsuirNetworkError with cause after retries are exhausted", async () => {
    const first = new Error("ECONNRESET");
    const second = new Error("ETIMEDOUT");
    const fetchImpl = mockFetchSequence([first, second, second]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 2 });

    let error: unknown;
    try {
      await requestJson(config, "/faculties");
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(BsuirNetworkError);
    expect(error).toMatchObject({
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      cause: second
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
