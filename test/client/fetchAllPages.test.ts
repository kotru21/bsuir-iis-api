import { describe, expect, it, vi } from "vitest";
import { BsuirResponseValidationError } from "../../src/client/errors";
import { fetchAllSpringPages } from "../../src/client/fetchAllPages";
import { captureRejection } from "../helpers/captureRejection";

describe("fetchAllSpringPages", () => {
  it("returns plain array payload without further fetches", async () => {
    const fetchPage = vi.fn(async () => [{ id: 1 }, { id: 2 }]);
    const items = await fetchAllSpringPages<{ id: number }>(
      fetchPage,
      {},
      {
        maxPages: 50,
        resourceLabel: "Announcements",
        endpoint: "/announcements/employees"
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
        resourceLabel: "Announcements",
        endpoint: "/announcements/employees"
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
      fetchAllSpringPages(
        fetchPage,
        {},
        { maxPages: 50, resourceLabel: "Announcements", endpoint: "/announcements/employees" }
      )
    ).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("throws when pageNumber does not advance while last is false", async () => {
    const fetchPage = vi.fn(async () => ({
      content: [{ id: 1 }],
      pageable: { pageNumber: 0, pageSize: 1 },
      last: false
    }));
    await expect(
      fetchAllSpringPages(
        fetchPage,
        {},
        { maxPages: 50, resourceLabel: "Announcements", endpoint: "/announcements/employees" }
      )
    ).rejects.toThrow(BsuirResponseValidationError);
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
      fetchAllSpringPages(
        fetchPage,
        { size: 1 },
        { maxPages: 10, resourceLabel: "Catalog", endpoint: "/student-groups" }
      )
    ).rejects.toBeInstanceOf(BsuirResponseValidationError);
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
      fetchAllSpringPages(
        fetchPage,
        { size: 1 },
        { maxPages: 50, resourceLabel: "Catalog", endpoint: "/student-groups" }
      )
    ).rejects.toThrow(
      /\/student-groups: Catalog page must be an array or a page envelope, got object/
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("fetches another page when last/totalPages are absent and content fills pageSize", async () => {
    const fetchPage = vi.fn(async (query: Record<string, string | number>) => {
      const page = typeof query.page === "number" ? query.page : 0;
      if (page === 0) {
        return {
          content: [{ id: 0 }, { id: 1 }],
          pageable: { pageNumber: 0, pageSize: 2 }
        };
      }
      return {
        content: [{ id: 2 }],
        pageable: { pageNumber: 1, pageSize: 2 }
      };
    });
    const items = await fetchAllSpringPages<{ id: number }>(
      fetchPage,
      { size: 2 },
      { maxPages: 50, resourceLabel: "Catalog", endpoint: "/student-groups" }
    );
    expect(items.map((i) => i.id)).toEqual([0, 1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops when last/totalPages are absent and content is a partial page", async () => {
    const fetchPage = vi.fn(async () => ({
      content: [{ id: 1 }],
      pageable: { pageNumber: 0, pageSize: 20 }
    }));
    const items = await fetchAllSpringPages<{ id: number }>(
      fetchPage,
      {},
      { maxPages: 50, resourceLabel: "Catalog", endpoint: "/student-groups" }
    );
    expect(items).toEqual([{ id: 1 }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("fetchAllSpringPages — error reporting", () => {
  it("reports the endpoint on cap overflow (not a configuration error)", async () => {
    const fetchPage = vi.fn(async () => ({
      content: [],
      pageable: { pageNumber: 0, pageSize: 20 },
      totalPages: 51,
      last: false
    }));
    const error: unknown = await captureRejection(
      fetchAllSpringPages(
        fetchPage,
        {},
        {
          maxPages: 50,
          resourceLabel: "Announcements",
          endpoint: "/announcements/departments"
        }
      )
    );
    expect(error).toBeInstanceOf(BsuirResponseValidationError);
    expect((error as BsuirResponseValidationError).endpoint).toBe("/announcements/departments");
    expect((error as Error).message).toMatch(/safety cap of 50 pages/);
  });

  it("rejects a non-array, non-page first payload", async () => {
    const fetchPage = vi.fn(async () => null);
    await expect(
      fetchAllSpringPages(
        fetchPage,
        {},
        { maxPages: 50, resourceLabel: "Catalog", endpoint: "/faculties" }
      )
    ).rejects.toThrow(/got null/);
  });
});
