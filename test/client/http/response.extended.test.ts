import { describe, expect, it } from "vitest";
import { parseBody } from "../../../src/client/http/response";
import { BsuirApiError } from "../../../src/client/errors";

function makeResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType },
  });
}

describe("parseBody", () => {
  it("parses JSON body correctly", async () => {
    const result = await parseBody(makeResponse('{"ok":true}', "application/json"), 1_000_000);
    expect(result).toEqual({ ok: true });
  });

  it("returns plain text for non-JSON content-type", async () => {
    // line 60 — text.length > 0 && !declaredJson → return text (not JSON)
    const result = await parseBody(makeResponse("2\n", "text/plain"), 1_000_000);
    expect(result).toBe("2\n");
  });

  it("returns empty string for empty body with non-JSON content type", async () => {
    const result = await parseBody(makeResponse("", "text/plain"), 1_000_000);
    expect(result).toBe("");
  });

  it("throws BsuirApiError for empty JSON body (declaredJson, empty text)", async () => {
    await expect(
      parseBody(makeResponse("", "application/json"), 1_000_000)
    ).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("throws BsuirApiError for malformed JSON with JSON content-type", async () => {
    await expect(
      parseBody(makeResponse("not-json{{", "application/json"), 1_000_000)
    ).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("returns raw text for malformed JSON with non-JSON content-type", async () => {
    const result = await parseBody(makeResponse("not-json", "text/html"), 1_000_000);
    expect(result).toBe("not-json");
  });

  it("throws when content-length exceeds maxResponseBytes", async () => {
    const response = new Response("x".repeat(100), {
      status: 200,
      headers: { "Content-Type": "text/plain", "Content-Length": "100" },
    });
    await expect(parseBody(response, 50)).rejects.toBeInstanceOf(BsuirApiError);
  });
});
