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

export class BsuirNetworkError extends Error {
  readonly endpoint: string;
  readonly causeError: unknown;

  constructor(message: string, endpoint: string, causeError: unknown) {
    super(message);
    this.name = "BsuirNetworkError";
    this.endpoint = endpoint;
    this.causeError = causeError;
  }
}

export class BsuirTimeoutError extends Error {
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(message: string, endpoint: string, timeoutMs: number) {
    super(message);
    this.name = "BsuirTimeoutError";
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}

export class BsuirValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsuirValidationError";
  }
}
