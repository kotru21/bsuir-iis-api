/**
 * Compile-time guarantees of `object<T>()`: a DTO schema must cover every field of its
 * interface with exactly matching types. Each `@ts-expect-error` below fails the
 * typecheck if the corresponding drift stops being a compile error.
 */
import { array, nullable, number, object, optional, string } from "../../src/schema/core";

interface Sample {
  readonly name: string;
  readonly note: string | null;
  readonly count?: number;
  readonly tags: readonly string[];
}

export const matching = object<Sample>({
  name: string(),
  note: nullable(string()),
  count: optional(number()),
  tags: array(string())
});

// @ts-expect-error a field of the interface has no validator
export const missingField = object<Sample>({
  name: string(),
  note: nullable(string()),
  count: optional(number())
});

export const extraField = object<Sample>({
  name: string(),
  note: nullable(string()),
  count: optional(number()),
  tags: array(string()),
  // @ts-expect-error the schema validates a field the interface does not declare
  extra: string()
});

export const nullNotAccepted = object<Sample>({
  name: string(),
  // @ts-expect-error the type allows null but the validator would reject it
  note: string(),
  count: optional(number()),
  tags: array(string())
});

export const nullWronglyAccepted = object<Sample>({
  // @ts-expect-error the validator accepts null but the type does not allow it
  name: nullable(string()),
  note: nullable(string()),
  count: optional(number()),
  tags: array(string())
});

export const wrongPrimitive = object<Sample>({
  name: string(),
  note: nullable(string()),
  // @ts-expect-error wrong field type
  count: optional(string()),
  tags: array(string())
});

export const wrongElement = object<Sample>({
  name: string(),
  note: nullable(string()),
  count: optional(number()),
  // @ts-expect-error wrong array element type
  tags: array(number())
});

export const optionalWithoutOptional = object<Sample>({
  name: string(),
  note: nullable(string()),
  // @ts-expect-error an optional field must be declared with optional()
  count: number(),
  tags: array(string())
});

export const requiredDeclaredOptional = object<Sample>({
  // @ts-expect-error a required field must not be declared with optional()
  name: optional(string()),
  note: nullable(string()),
  count: optional(number()),
  tags: array(string())
});
