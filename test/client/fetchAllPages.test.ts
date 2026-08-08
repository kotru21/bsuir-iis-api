import { describe, expect, it, vi } from "vitest";
import { BsuirConfigurationError } from "../../src/client/errors";
import { fetchAllSpringPages } from "../../src/client/fetchAllPages";

describe("fetchAllSpringPages", () => {
  it("returns plain array payload without further fetches", async () => {
    const fetchPage = vi.fn(async () => [{ id: 1 }, { id: 2 }]);
    const items = await fetchAllSpringPages<{ id: number }>(
      fetchPage,
      {},
      {
        maxPages: 50,
        resourceLabel: "Announcements"
      }
    );
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("concatenates Spring pages until last", async () => {
    const fetchPage = vi.fn(async (query: Record<string, string | number>) => {
      const page = typeof query.page === "number" ? query.page : 0;
      return {
        content: [{ id: page }],
        pageable: { pageNumber: page, pageSize: 1 },
        totalPages: 3,
        last: page === 2
      };
    });
    const items = await fetchAllSpringPages<{ id: number }>(
      fetchPage,
      { size: 1 },
      {
        maxPages: 50,
        resourceLabel: "Announcements"
      }
    );
    expect(items.map((i) => i.id)).toEqual([0, 1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("throws when totalPages exceeds maxPages", async () => {
    const fetchPage = vi.fn(async () => ({
      content: [],
      pageable: { pageNumber: 0, pageSize: 20 },
      totalPages: 51,
      last: false
    }));
    await expect(
      fetchAllSpringPages(fetchPage, {}, { maxPages: 50, resourceLabel: "Announcements" })
    ).rejects.toBeInstanceOf(BsuirConfigurationError);
  });

  it("throws when pageNumber does not advance while last is false", async () => {
    const fetchPage = vi.fn(async () => ({
      content: [{ id: 1 }],
      pageable: { pageNumber: 0, pageSize: 1 },
      last: false
    }));
    await expect(
      fetchAllSpringPages(fetchPage, {}, { maxPages: 50, resourceLabel: "Announcements" })
    ).rejects.toThrow(BsuirConfigurationError);
    // First page + one stuck follow-up — must not keep looping toward maxPages.
    expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("throws when pageNumber stays stuck across follow-up fetches", async () => {
    const fetchPage = vi.fn(async (query: Record<string, string | number>) => {
      const requested = typeof query.page === "number" ? query.page : 0;
      return {
        content: [{ id: requested }],
        // Server acknowledges the request page in content but reports pageNumber=0 forever.
        pageable: { pageNumber: 0, pageSize: 1 },
        last: false
      };
    });
    await expect(
      fetchAllSpringPages(fetchPage, { size: 1 }, { maxPages: 10, resourceLabel: "Catalog" })
    ).rejects.toBeInstanceOf(BsuirConfigurationError);
    expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("throws when a follow-up page has non-array content", async () => {
    const fetchPage = vi.fn(async (query: Record<string, string | number>) => {
      const page = typeof query.page === "number" ? query.page : 0;
      if (page === 0) {
        return {
          content: [{ id: 0 }],
          pageable: { pageNumber: 0, pageSize: 1 },
          last: false
        };
      }
      return {
        content: { not: "an array" },
        pageable: { pageNumber: 1, pageSize: 1 },
        last: true
      };
    });
    await expect(
      fetchAllSpringPages(fetchPage, { size: 1 }, { maxPages: 50, resourceLabel: "Catalog" })
    ).rejects.toThrow(/non-array page payload/);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
