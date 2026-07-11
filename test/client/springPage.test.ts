import { describe, expect, it } from "vitest";
import { unwrapSpringPageContent } from "../../src/client/springPage";

describe("unwrapSpringPageContent", () => {
  it("returns plain arrays unchanged", () => {
    const items = [{ id: 1 }];
    expect(unwrapSpringPageContent(items)).toBe(items);
  });

  it("returns content array from Spring page envelope", () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(
      unwrapSpringPageContent({
        content: items,
        totalElements: 2,
        totalPages: 1,
        last: true
      })
    ).toBe(items);
  });

  it("returns original payload when object has no content array", () => {
    const payload = { totalElements: 0 };
    expect(unwrapSpringPageContent(payload)).toBe(payload);
  });

  it("returns non-object payloads unchanged", () => {
    expect(unwrapSpringPageContent(null)).toBe(null);
    expect(unwrapSpringPageContent("x")).toBe("x");
    expect(unwrapSpringPageContent(1)).toBe(1);
  });
});
