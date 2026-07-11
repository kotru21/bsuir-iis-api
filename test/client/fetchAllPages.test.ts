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
});
