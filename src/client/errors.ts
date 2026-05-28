/**
 * Restores proper prototype chain for Error subclasses in transpiled outputs.
 * TypeScript's ES<2015 transpilation breaks `class Foo extends Error`:
 * the compiled function lacks Error.prototype in its chain. This restores it.
 * See: https://github.com/microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins
 */
function fixErrorPrototype(_instance: Error, _prototype: object): void {
  // No-op: target in this project is ES2015+ so Error subclassing is correct.
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

export class BsuirResponsePayloadTooLargeError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly maxResponseBytes: number;

  constructor(message: string, status: number, endpoint: string, maxResponseBytes: number) {
    super(message);
    fixErrorPrototype(this, BsuirResponsePayloadTooLargeError.prototype);
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
    fixErrorPrototype(this, BsuirNetworkError.prototype);
    this.name = "BsuirNetworkError";
    this.endpoint = endpoint;
  }
}

export class BsuirTimeoutError extends Error {
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(message: string, endpoint: string, timeoutMs: number, cause?: unknown) {
    super(message, { cause });
    fixErrorPrototype(this, BsuirTimeoutError.prototype);
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
    fixErrorPrototype(this, BsuirValidationError.prototype);
    this.name = "BsuirValidationError";
    this.field = field;
    this.value = value;
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
