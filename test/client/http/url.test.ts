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
});
