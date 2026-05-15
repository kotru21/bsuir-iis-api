import { BsuirApiError } from "../errors";

async function readBodyTextWithLimit(
  response: Response,
  maxResponseBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const parsedLength = Number(contentLengthHeader);
    if (Number.isFinite(parsedLength) && parsedLength > maxResponseBytes) {
      throw new BsuirApiError(
        `Response body exceeds maxResponseBytes limit (${String(maxResponseBytes)} bytes)`,
        response.status,
        response.url,
        null
      );
    }
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const fallbackText = await response.text();
    if (new TextEncoder().encode(fallbackText).byteLength > maxResponseBytes) {
      throw new BsuirApiError(
        `Response body exceeds maxResponseBytes limit (${String(maxResponseBytes)} bytes)`,
        response.status,
        response.url,
        null
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
      throw new BsuirApiError(
        `Response body exceeds maxResponseBytes limit (${String(maxResponseBytes)} bytes)`,
        response.status,
        response.url,
        null
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

/**
 * Parses response body as JSON when possible, otherwise returns text.
 * Throws `BsuirApiError` for declared JSON payloads that are empty/invalid.
 */
export async function parseBody(response: Response, maxResponseBytes: number): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const declaredJson = contentType.includes("application/json");
  const text = await readBodyTextWithLimit(response, maxResponseBytes);
  if (text.length === 0) {
    if (declaredJson) {
      throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
    }
    return "";
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (declaredJson) {
      throw new BsuirApiError("Invalid JSON response payload", response.status, response.url, null);
    }
    return text;
  }
}
