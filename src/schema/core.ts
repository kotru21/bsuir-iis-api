import { BsuirResponseValidationError } from "../client/errors";

/**
 * Minimal runtime schema bound to a TypeScript type.
 *
 * The public DTO interfaces (`src/types`) stay the documented contract; every DTO
 * has exactly one schema built with {@link object}, which the compiler checks against
 * the interface field by field (see {@link ObjectShape}). Adding, removing or
 * retyping a field on one side without the other is a compile error, so the deep
 * validators can never drift from the types.
 *
 * @internal Not exported from the package root.
 */
export interface Schema<T> {
  /** Human-readable expectation used in error messages ("string or null"). */
  readonly expected: string;
  /**
   * Shallow kind test (string? array? object?) without looking inside. Lets wrappers
   * pick an error message or a union branch while deep errors keep their own location.
   */
  readonly isShape: (value: unknown) => boolean;
  /** Throws `BsuirResponseValidationError` when `value` does not match. */
  readonly check: (value: unknown, location: string, endpoint: string) => void;
  /**
   * Phantom member, never set: `T` appears in both parameter and return position,
   * which makes `Schema<T>` invariant. `Schema<string>` is therefore not accepted
   * where `Schema<string | null>` is expected, and vice versa.
   */
  readonly __type?: (value: T) => T;
}

/**
 * One schema per property of `T` — required for optional properties too, so a field
 * can never be left unvalidated. Excess keys are rejected by the object-literal check.
 */
export type ObjectShape<T> = { readonly [Key in keyof T]-?: Schema<T[Key]> };

/** Short type label for error messages: `null`, `array`, or the `typeof` result. */
export function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

/** Throws the SDK's standard field-level validation error. */
export function failField(
  endpoint: string,
  location: string,
  expectation: string,
  value: unknown
): never {
  const subject = location.length > 0 ? `'${location}'` : "payload";
  throw new BsuirResponseValidationError(
    `Invalid response payload for ${endpoint}: ${subject} must be ${expectation}, got ${describeValue(value)}`,
    endpoint
  );
}

/** `value` as a plain record, or `null` for null, arrays and primitives. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function primitive<T>(expected: string, accepts: (value: unknown) => boolean): Schema<T> {
  return {
    expected,
    isShape: accepts,
    check(value, location, endpoint) {
      if (!accepts(value)) {
        failField(endpoint, location, expected, value);
      }
    }
  };
}

const STRING: Schema<string> = primitive("string", (value) => typeof value === "string");
const NUMBER: Schema<number> = primitive(
  "a finite number",
  (value) => typeof value === "number" && Number.isFinite(value)
);
const BOOLEAN: Schema<boolean> = primitive("boolean", (value) => typeof value === "boolean");
const UNKNOWN: Schema<unknown> = {
  expected: "any value",
  isShape: () => true,
  check() {
    // Accepts every value by definition.
  }
};

/** A string. */
export function string(): Schema<string> {
  return STRING;
}

/** A finite number (`NaN` / `Infinity` are rejected). */
export function number(): Schema<number> {
  return NUMBER;
}

/** A boolean. */
export function boolean(): Schema<boolean> {
  return BOOLEAN;
}

/** Any value: for fields whose shape IIS has not stabilized (`currentTerm`, …). */
export function unknown(): Schema<unknown> {
  return UNKNOWN;
}

/** `inner` or `null`. */
export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  const expected = `${inner.expected} or null`;
  return {
    expected,
    isShape: (value) => value === null || inner.isShape(value),
    check(value, location, endpoint) {
      if (value === null) {
        return;
      }
      if (!inner.isShape(value)) {
        failField(endpoint, location, expected, value);
      }
      inner.check(value, location, endpoint);
    }
  };
}

/** `inner` or absent — for `field?:` properties. */
export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return {
    expected: inner.expected,
    isShape: (value) => value === undefined || inner.isShape(value),
    check(value, location, endpoint) {
      if (value !== undefined) {
        inner.check(value, location, endpoint);
      }
    }
  };
}

/** A (read-only) array whose every element matches `item`. */
export function array<T>(item: Schema<T>): Schema<readonly T[]> {
  return {
    expected: "an array",
    isShape: (value) => Array.isArray(value),
    check(value, location, endpoint) {
      if (!Array.isArray(value)) {
        failField(endpoint, location, "an array", value);
      }
      for (const [index, element] of value.entries()) {
        item.check(element, `${location}[${String(index)}]`, endpoint);
      }
    }
  };
}

/**
 * Either schema, chosen by the value's kind (`isShape`): an object goes to the object
 * branch and reports that branch's deep errors. Branches must differ in kind.
 */
export function union<A, B>(first: Schema<A>, second: Schema<B>): Schema<A | B> {
  const expected = `${first.expected} or ${second.expected}`;
  return {
    expected,
    isShape: (value) => first.isShape(value) || second.isShape(value),
    check(value, location, endpoint) {
      const branch = first.isShape(value) ? first : second.isShape(value) ? second : undefined;
      if (!branch) {
        failField(endpoint, location, expected, value);
      }
      branch.check(value, location, endpoint);
    }
  };
}

/**
 * A plain object whose fields match `shape`; pass the DTO interface explicitly:
 * `object<Faculty>({ id: number(), ... })`.
 *
 * A field is validated **when present**: IIS omits keys on sparse payloads, and strict
 * mode is meant to flag wrong shapes, not missing data — so required-vs-optional is a
 * type-level distinction only. Unknown extra fields are allowed (IIS adds fields).
 */
export function object<T extends object>(shape: ObjectShape<T>): Schema<T> {
  const fields = Object.entries(shape) as [string, Schema<unknown>][];
  return {
    expected: "an object",
    isShape: (value) => asRecord(value) !== null,
    check(value, location, endpoint) {
      const record = asRecord(value);
      if (!record) {
        failField(endpoint, location, "an object", value);
      }
      const prefix = location.length > 0 ? `${location}.` : "";
      for (const [field, schema] of fields) {
        const fieldValue = record[field];
        if (fieldValue !== undefined) {
          schema.check(fieldValue, `${prefix}${field}`, endpoint);
        }
      }
    }
  };
}

/** Runs `schema` against a whole payload (root location `""`). */
export function assertMatches<T>(
  schema: Schema<T>,
  value: unknown,
  endpoint: string
): asserts value is T {
  schema.check(value, "", endpoint);
}
