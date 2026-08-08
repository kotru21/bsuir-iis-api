/** HTTP error returned by IIS (non-2xx) after the SDK parses the body. */
export class BsuirApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body: unknown;

  constructor(message: string, status: number, endpoint: string, body: unknown) {
    super(message);
    this.name = "BsuirApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

/** Thrown when a response body exceeds the configured `maxResponseBytes` limit. */
export class BsuirResponsePayloadTooLargeError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly maxResponseBytes: number;

  constructor(message: string, status: number, endpoint: string, maxResponseBytes: number) {
    super(message);
    this.name = "BsuirResponsePayloadTooLargeError";
    this.status = status;
    this.endpoint = endpoint;
    this.maxResponseBytes = maxResponseBytes;
  }
}

/** Transport / network failure while talking to IIS. */
export class BsuirNetworkError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string, cause: unknown) {
    super(message, { cause });
    this.name = "BsuirNetworkError";
    this.endpoint = endpoint;
  }
}

/** Request aborted because the client-side timeout elapsed. */
export class BsuirTimeoutError extends Error {
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(message: string, endpoint: string, timeoutMs: number, cause?: unknown) {
    super(message, { cause });
    this.name = "BsuirTimeoutError";
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}

/** Invalid caller input (group number, urlId, ids, etc.). */
export class BsuirValidationError extends Error {
  readonly field: string | undefined;
  readonly value: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message);
    this.name = "BsuirValidationError";
    this.field = field;
    this.value = value;
  }
}

/**
 * Response shape failed runtime validation.
 *
 * Thrown for always-on structural envelope guards (catalog/announcement unwraps,
 * schedule maps/day buckets/`exams`) and for deep item/field checks when
 * `validateResponses` is enabled / `createBsuirClient.strict()` is used.
 */
export class BsuirResponseValidationError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string) {
    super(message);
    this.name = "BsuirResponseValidationError";
    this.endpoint = endpoint;
  }
}

/** Misconfigured client or unsafe pagination (missing fetch, page-cap exceeded, etc.). */
export class BsuirConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsuirConfigurationError";
  }
}
