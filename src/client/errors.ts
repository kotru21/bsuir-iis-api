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

export class BsuirNetworkError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string, cause: unknown) {
    super(message, { cause });
    this.name = "BsuirNetworkError";
    this.endpoint = endpoint;
  }
}

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

export class BsuirResponseValidationError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string) {
    super(message);
    this.name = "BsuirResponseValidationError";
    this.endpoint = endpoint;
  }
}

export class BsuirConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsuirConfigurationError";
  }
}
