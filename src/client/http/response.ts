import { BsuirApiError, BsuirResponsePayloadTooLargeError } from "../errors";

const UTF8_ENCODER = new TextEncoder();

/**
 * Best-effort cancellation of an unread response body.
 *
 * Runtimes like undici cannot reuse the underlying keep-alive connection until
 * the body is consumed or cancelled, so callers that abandon a response (retry
 * of a failed status, early size-limit exit) should cancel it explicitly.
 */
export async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation is a resource hint only; failures (locked/disturbed stream) are ignored.
  }
}

async function readBodyTextWithLimit(
  response: Response,
  maxResponseBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const parsedLength = Number(contentLengthHeader);
    if (Number.isFinite(parsedLength) && parsedLength > maxResponseBytes) {
      await cancelResponseBody(response);
      throw new BsuirResponsePayloadTooLargeError(
        `Response body exceeds maxResponseBytes limit (${String(maxResponseBytes)} bytes)`,
        response.status,
        response.url,
        maxResponseBytes
      );
    }
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const fallbackText = await response.text();
    if (UTF8_ENCODER.encode(fallbackText).byteLength > maxResponseBytes) {
      throw new BsuirResponsePayloadTooLargeError(
        `Response body exceeds maxResponseBytes limit (${String(maxResponseBytes)} bytes)`,
        response.status,
        response.url,
        maxResponseBytes
      );
    }
    return fallbackText;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytesRead += value.byteLength;
    if (bytesRead > maxResponseBytes) {
      await reader.cancel();
      throw new BsuirResponsePayloadTooLargeError(
        `Response body exceeds maxResponseBytes limit (${String(maxResponseBytes)} bytes)`,
        response.status,
        response.url,
        maxResponseBytes
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

/**
 * Parses response body as JSON when possible, otherwise returns text.
 * Returns `null` for empty bodies that are not treated as strict JSON success payloads.
 * Throws `BsuirApiError` for **2xx** responses that declare JSON but are empty/invalid.
 * For **non-2xx**, preserves raw text (IIS sometimes labels plain-text errors as JSON).
 */
export async function parseBody(response: Response, maxResponseBytes: number): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const declaredJson = contentType.includes("application/json");
  const text = await readBodyTextWithLimit(response, maxResponseBytes);
  if (text.length === 0) {
    if (declaredJson && response.ok) {
      throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
    }
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (declaredJson && response.ok) {
      throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
    }
    return text;
  }
}
