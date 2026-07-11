import { describe, expect, it } from "vitest";
import { BsuirApiError, BsuirResponsePayloadTooLargeError } from "../../../src/client/errors";
import { parseBody } from "../../../src/client/http/response";

function makeResponse(
  body: string,
  {
    contentType = "application/json",
    contentLength,
    useStream = true
  }: { contentType?: string; contentLength?: number; useStream?: boolean } = {}
): Response {
  const headers = new Headers({ "content-type": contentType });
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }

  if (!useStream) {
    // Simulate environments where response.body is unavailable
    const r = new Response(body, { headers });
    Object.defineProperty(r, "body", { value: null });
    return r;
  }

  return new Response(body, { headers });
}

describe("parseBody", () => {
  const limit = 100;

  it("parses valid JSON body", async () => {
    const res = makeResponse('{"x":1}');
    expect(await parseBody(res, limit)).toEqual({ x: 1 });
  });

  it("returns text body when content-type is not JSON", async () => {
    const res = makeResponse("hello", { contentType: "text/plain" });
    expect(await parseBody(res, limit)).toBe("hello");
  });

  it("throws when content-length header exceeds limit", async () => {
    const res = makeResponse("x", { contentLength: 200 });
    await expect(parseBody(res, limit)).rejects.toBeInstanceOf(BsuirResponsePayloadTooLargeError);
  });

  it("does not throw when content-length is within limit", async () => {
    const res = makeResponse('{"a":1}', { contentLength: 7 });
    await expect(parseBody(res, limit)).resolves.toEqual({ a: 1 });
  });

  it("throws when body exceeds limit while streaming", async () => {
    const big = "x".repeat(limit + 1);
    const res = makeResponse(big, { contentType: "text/plain" });
    await expect(parseBody(res, limit)).rejects.toBeInstanceOf(BsuirResponsePayloadTooLargeError);
  });

  it("throws for empty body when content-type is JSON", async () => {
    const res = makeResponse("", { contentType: "application/json" });
    await expect(parseBody(res, limit)).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("returns null for empty body when content-type is not JSON", async () => {
    const res = makeResponse("", { contentType: "text/plain" });
    expect(await parseBody(res, limit)).toBeNull();
  });

  it("throws for invalid JSON when content-type is JSON", async () => {
    const res = makeResponse("{not json}", { contentType: "application/json" });
    await expect(parseBody(res, limit)).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("returns raw text for invalid JSON when content-type is not JSON", async () => {
    const res = makeResponse("{not json}", { contentType: "text/plain" });
    expect(await parseBody(res, limit)).toBe("{not json}");
  });

  it("preserves raw text for non-2xx when Content-Type claims JSON but body is plain text", async () => {
    const seasonal =
      "Сервис временно недоступен. Работа ИИС возобновится после 15 августа.";
    const res = new Response(seasonal, {
      status: 503,
      headers: { "content-type": "application/json" }
    });
    expect(await parseBody(res, 10_000)).toBe(seasonal);
  });

  it("returns null for empty non-2xx body even when Content-Type claims JSON", async () => {
    const res = new Response("", {
      status: 503,
      headers: { "content-type": "application/json" }
    });
    expect(await parseBody(res, limit)).toBeNull();
  });

  it("uses text() fallback when response.body is null", async () => {
    const res = makeResponse('{"fallback":true}', { useStream: false });
    expect(await parseBody(res, 1000)).toEqual({ fallback: true });
  });

  it("throws via fallback when body is null and text exceeds limit", async () => {
    const big = "x".repeat(limit + 1);
    const res = makeResponse(big, { contentType: "text/plain", useStream: false });
    await expect(parseBody(res, limit)).rejects.toBeInstanceOf(BsuirResponsePayloadTooLargeError);
  });
});
