/**
 * Common base class of every error the SDK throws on purpose.
 *
 * Catch it to tell SDK failures apart from bugs in your own code:
 * `if (error instanceof BsuirError) { ... }`. A caller's own `AbortSignal`
 * reason is re-thrown as-is and is therefore not a `BsuirError`.
 */
export class BsuirError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BsuirError";
  }
}

/**
 * HTTP error returned by IIS (non-2xx) after the SDK parses the body.
 * A 2xx response with a broken body is a {@link BsuirResponseValidationError} instead.
 */
export class BsuirApiError extends BsuirError {
  readonly status: number;
  readonly endpoint: string;
  readonly body: unknown;
  /**
   * Server `Retry-After` hint in milliseconds, when the response carried a valid one.
   * Set even when the SDK did not retry (e.g. the hint exceeded the 60 s ceiling).
   */
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    status: number,
    endpoint: string,
    body: unknown,
    retryAfterMs?: number
  ) {
    super(message);
    this.name = "BsuirApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Thrown when a response body exceeds the configured `maxResponseBytes` limit. */
export class BsuirResponsePayloadTooLargeError extends BsuirError {
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
export class BsuirNetworkError extends BsuirError {
  readonly endpoint: string;

  constructor(message: string, endpoint: string, cause: unknown) {
    super(message, { cause });
    this.name = "BsuirNetworkError";
    this.endpoint = endpoint;
  }
}

/** Request aborted because the client-side timeout elapsed. */
export class BsuirTimeoutError extends BsuirError {
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
export class BsuirValidationError extends BsuirError {
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
 * schedule maps/day buckets/`exams`, the `current-week` value, Spring pagination
 * that is malformed or exceeds the safety cap), for a 2xx body declared as JSON that
 * is empty or not valid JSON (not retried), and for deep item/field checks when
 * `validateResponses` is enabled / `createBsuirClient.strict()` is used.
 */
export class BsuirResponseValidationError extends BsuirError {
  readonly endpoint: string;

  constructor(message: string, endpoint: string) {
    super(message);
    this.name = "BsuirResponseValidationError";
    this.endpoint = endpoint;
  }
}

/**
 * Misconfigured client: missing `fetch`, invalid option values, a disallowed `baseUrl`,
 * or a response redirected to a host outside `allowedBaseUrlHosts`.
 */
export class BsuirConfigurationError extends BsuirError {
  constructor(message: string) {
    super(message);
    this.name = "BsuirConfigurationError";
  }
}
