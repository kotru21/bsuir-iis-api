// Maintains proper prototype chains for custom Error subclasses in transpiled outputs.
function fixErrorPrototype(instance: Error, prototype: object): void {
  Object.setPrototypeOf(instance, prototype);
}

export class BsuirApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body: unknown;

  constructor(message: string, status: number, endpoint: string, body: unknown) {
    super(message);
    fixErrorPrototype(this, BsuirApiError.prototype);
    this.name = "BsuirApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

export class BsuirNetworkError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string, cause: unknown) {
    super(message, { cause });
    fixErrorPrototype(this, BsuirNetworkError.prototype);
    this.name = "BsuirNetworkError";
    this.endpoint = endpoint;
  }
}

export class BsuirTimeoutError extends Error {
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(message: string, endpoint: string, timeoutMs: number) {
    super(message);
    fixErrorPrototype(this, BsuirTimeoutError.prototype);
    this.name = "BsuirTimeoutError";
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }
}

export class BsuirValidationError extends Error {
  constructor(message: string) {
    super(message);
    fixErrorPrototype(this, BsuirValidationError.prototype);
    this.name = "BsuirValidationError";
  }
}

export class BsuirResponseValidationError extends Error {
  readonly endpoint: string;

  constructor(message: string, endpoint: string) {
    super(message);
    fixErrorPrototype(this, BsuirResponseValidationError.prototype);
    this.name = "BsuirResponseValidationError";
    this.endpoint = endpoint;
  }
}

export class BsuirConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    fixErrorPrototype(this, BsuirConfigurationError.prototype);
    this.name = "BsuirConfigurationError";
  }
}
