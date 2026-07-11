function isBodyInit(value: unknown): value is BodyInit {
  if (typeof value === "string") {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return true;
  }
  // FormData, Blob and ReadableStream are not always available in every runtime,
  // so guard with typeof to avoid ReferenceErrors in minimal environments.
  if (typeof FormData !== "undefined" && value instanceof FormData) {
    return true;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return true;
  }
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
    return true;
  }
  return false;
}

export function serializeRequestBody(rawBody: unknown, headers: Headers): BodyInit | undefined {
  if (rawBody === undefined) {
    return undefined;
  }
  if (isBodyInit(rawBody)) {
    // Pass-through for stream/form/binary bodies. Do not set Content-Type; the platform
    // (or the caller's explicit header) is responsible for it — e.g. FormData picks its
    // own multipart boundary.
    return rawBody;
  }
  // Fall through to JSON for plain objects/arrays/numbers/booleans/null.
  const serialized = JSON.stringify(rawBody);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return serialized;
}
