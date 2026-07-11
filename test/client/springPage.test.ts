import { describe, expect, it } from "vitest";
import { readSpringPageMeta, unwrapSpringPageContent } from "../../src/client/springPage";

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

describe("readSpringPageMeta", () => {
  it("returns null for plain arrays", () => {
    expect(readSpringPageMeta([{ id: 1 }])).toBeNull();
  });

  it("reads totalPages, last, pageNumber, and pageSize from a Spring page", () => {
    expect(
      readSpringPageMeta({
        content: [{ id: 1 }],
        totalPages: 3,
        last: false,
        number: 0,
        size: 20,
        pageable: { pageNumber: 0, pageSize: 20 }
      })
    ).toEqual({
      totalPages: 3,
      last: false,
      pageNumber: 0,
      pageSize: 20
    });
  });

  it("falls back to size/number when pageable is missing", () => {
    expect(
      readSpringPageMeta({
        content: [],
        totalPages: 1,
        last: true,
        number: 0,
        size: 10
      })
    ).toEqual({
      totalPages: 1,
      last: true,
      pageNumber: 0,
      pageSize: 10
    });
  });

  it("returns null when content is not an array", () => {
    expect(readSpringPageMeta({ content: "nope", totalPages: 1 })).toBeNull();
  });
});
