import { describe, expect, it } from "vitest";
import { buildUrl } from "../../../src/client/http/url";
import { BsuirValidationError } from "../../../src/client/errors";

describe("buildUrl", () => {
  it("builds a simple URL from base and path", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/schedule")).toBe(
      "https://iis.bsuir.by/api/v1/schedule"
    );
  });

  it("strips trailing slash from baseUrl", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1/", "/schedule")).toBe(
      "https://iis.bsuir.by/api/v1/schedule"
    );
  });

  it("prepends slash to path when missing", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "schedule")).toBe(
      "https://iis.bsuir.by/api/v1/schedule"
    );
  });

  it("appends string query param", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/groups", { name: "053503" })).toBe(
      "https://iis.bsuir.by/api/v1/groups?name=053503"
    );
  });

  it("skips undefined query param", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/groups", { name: undefined })).toBe(
      "https://iis.bsuir.by/api/v1/groups"
    );
  });

  it("skips null query param", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/groups", { name: null })).toBe(
      "https://iis.bsuir.by/api/v1/groups"
    );
  });

  it("coerces number query param to string", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/week", { n: 2 })).toBe(
      "https://iis.bsuir.by/api/v1/week?n=2"
    );
  });

  it("coerces boolean query param to string", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/items", { active: true })).toBe(
      "https://iis.bsuir.by/api/v1/items?active=true"
    );
  });

  it("rejects empty query key", () => {
    expect(() =>
      buildUrl("https://iis.bsuir.by/api/v1", "/items", { " ": "1" })
    ).toThrow(BsuirValidationError);
  });

  it("rejects unsafe query key characters", () => {
    expect(() =>
      buildUrl("https://iis.bsuir.by/api/v1", "/items", { "a&b": "1" })
    ).toThrow(BsuirValidationError);
  });

  it("rejects path traversal segments", () => {
    expect(() => buildUrl("https://iis.bsuir.by/api/v1", "../admin")).toThrow(BsuirValidationError);
    expect(() => buildUrl("https://iis.bsuir.by/api/v1", "/x/../admin")).toThrow(
      BsuirValidationError
    );
  });

  it("rejects absolute/protocol-style path overrides", () => {
    expect(() => buildUrl("https://iis.bsuir.by/api/v1", "//evil.test/path")).toThrow(
      BsuirValidationError
    );
    expect(() => buildUrl("https://iis.bsuir.by/api/v1", "https://evil.test/path")).toThrow(
      BsuirValidationError
    );
  });

  it("rejects backslashes in path", () => {
    expect(() => buildUrl("https://iis.bsuir.by/api/v1", String.raw`\\evil\path`)).toThrow(
      BsuirValidationError
    );
  });

  it("sorts query keys deterministically for stable cache keys", () => {
    const a = buildUrl("https://iis.bsuir.by/api/v1", "/x", { b: "2", a: "1", c: "3" });
    const b = buildUrl("https://iis.bsuir.by/api/v1", "/x", { c: "3", a: "1", b: "2" });
    expect(a).toBe(b);
    expect(a).toBe("https://iis.bsuir.by/api/v1/x?a=1&b=2&c=3");
  });

  it("allows printable non-structural characters in query keys (e.g. dot, bracket)", () => {
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/x", { "a.b": "1" })).toContain("a.b=1");
    expect(buildUrl("https://iis.bsuir.by/api/v1", "/x", { "filter[id]": "1" })).toContain(
      "id"
    );
  });
});
