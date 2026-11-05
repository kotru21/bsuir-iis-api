import { describe, expect, it } from "vitest";
import { BsuirResponseValidationError } from "../../src/client/errors";
import {
  array,
  assertMatches,
  boolean,
  nullable,
  number,
  object,
  optional,
  string,
  union,
  unknown
} from "../../src/schema/core";
import { scheduleResponseSchema } from "../../src/schema/dto";

interface Sample {
  readonly name: string;
  readonly note: string | null;
  readonly count?: number;
  readonly flags: readonly boolean[];
  readonly extra?: unknown;
  readonly nested: { readonly id: number } | null;
  readonly choice: string | readonly string[];
}

const sample = object<Sample>({
  name: string(),
  note: nullable(string()),
  count: optional(number()),
  flags: array(boolean()),
  extra: optional(unknown()),
  nested: nullable(object<{ readonly id: number }>({ id: number() })),
  choice: union(string(), array(string()))
});

function failure(value: unknown): string {
  try {
    assertMatches(sample, value, "/sample");
  } catch (error) {
    expect(error).toBeInstanceOf(BsuirResponseValidationError);
    return (error as Error).message.replace("Invalid response payload for /sample: ", "");
  }
  return "ok";
}

describe("schema core", () => {
  it("accepts matching values, extra fields and omitted fields (validate-when-present)", () => {
    expect(failure({ name: "a", note: null, flags: [true], nested: { id: 1 }, choice: "x" })).toBe(
      "ok"
    );
    expect(
      failure({ name: "a", flags: [], choice: ["x", "y"], whatever: 1, extra: { a: 1 } })
    ).toBe("ok");
    expect(failure({})).toBe("ok");
  });

  it("names the payload root and the failing location", () => {
    expect(failure(null)).toBe("payload must be an object, got null");
    expect(failure({ name: 1 })).toBe("'name' must be string, got number");
    expect(failure({ count: Number.NaN })).toBe("'count' must be a finite number, got number");
    expect(failure({ flags: "yes" })).toBe("'flags' must be an array, got string");
    expect(failure({ flags: [true, 1] })).toBe("'flags[1]' must be boolean, got number");
  });

  it("reports nullable expectations at the field, but deep errors at their own location", () => {
    expect(failure({ note: 5 })).toBe("'note' must be string or null, got number");
    expect(failure({ nested: [] })).toBe("'nested' must be an object or null, got array");
    expect(failure({ nested: { id: "1" } })).toBe(
      "'nested.id' must be a finite number, got string"
    );
  });

  it("routes union values by kind and reports both expectations otherwise", () => {
    expect(failure({ choice: ["x", 2] })).toBe("'choice[1]' must be string, got number");
    expect(failure({ choice: 3 })).toBe("'choice' must be string or an array, got number");
  });

  it("exposes shallow kind tests used by wrappers", () => {
    expect(optional(number()).isShape(undefined)).toBe(true);
    expect(optional(number()).isShape("1")).toBe(false);
    expect(unknown().isShape(Symbol("x"))).toBe(true);
    expect(nullable(string()).isShape(null)).toBe(true);
    expect(union(string(), number()).isShape(false)).toBe(false);
  });
});

describe("schedule map schema (deep path, without the structural pre-check)", () => {
  const check = (schedules: unknown) => () => {
    assertMatches(scheduleResponseSchema, { schedules }, "/schedule");
  };

  it("rejects a non-object map and non-array buckets, skips nullish buckets", () => {
    expect(check("nope")).toThrow("'schedules' must be an object or null, got string");
    expect(check({ Понедельник: "nope" })).toThrow(
      "'schedules.Понедельник' must be an array of lessons, got string"
    );
    expect(check({ Понедельник: null, Вторник: undefined, Воскресенье: [] })).not.toThrow();
  });

  it("rejects lessons under an unknown day key", () => {
    expect(check({ Воскресенье: [{}] })).toThrow(
      /'schedules\.Воскресенье' is not a known weekday key/
    );
  });
});
