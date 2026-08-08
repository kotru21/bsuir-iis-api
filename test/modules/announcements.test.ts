import { describe, expect, it, vi } from "vitest";
import { createBsuirClient } from "../../src";
import { BsuirApiError } from "../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("announcements module", () => {
  it("returns announcements for employee", async () => {
    const body = [{ id: 1, text: "Нет занятий", employeeId: 42 }];
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toHaveLength(1);
  });

  it("unwraps paginated envelope with content array", async () => {
    const announcements = [{ id: 1, content: "Объявление" }];
    const body = {
      content: announcements,
      pageable: { pageNumber: 0, pageSize: 20 },
      totalElements: 1,
      totalPages: 1,
      last: true
    };
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toEqual(announcements);
  });

  it("returns empty array when API returns 404 no-announcements envelope", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 404, body: { message: "No announcements found" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toEqual([]);
  });

  it("maps any 404 to empty array by default (no body-marker heuristic)", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 404, body: { message: "not found" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toEqual([]);
  });

  it("rethrows 404 when treat404AsEmpty: false is passed", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 404, body: { message: "not found" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
    await expect(
      client.announcements.byEmployee("v-petrov", { treat404AsEmpty: false })
    ).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("rethrows 400 errors", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ status: 400, body: {} })]);
    const client = createBsuirClient({ fetch: fetchImpl });
    await expect(client.announcements.byDepartment(1)).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("rethrows non-404/400 errors", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ status: 500, body: {} })]);
    const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
    await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("throws on invalid urlId", async () => {
    const client = createBsuirClient({ fetch: mockFetchSequence([]) });
    await expect(client.announcements.byEmployee("")).rejects.toThrow();
  });

  // line 28 — validateResponses: true → assertArrayResponse called on successful response
  it("validates array response when validateResponses: true (line 28)", async () => {
    const body = [{ id: 1, text: "Объявление" }];
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toHaveLength(1);
  });

  it("skips item field validation when validateResponses: false", async () => {
    // Array unwrap is still required; per-item announcement fields are not checked.
    const body = [{ id: 1 }];
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toEqual(body);
  });

  it("returns empty array for department 404 when treat404AsEmpty is default", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 404, body: { message: "No announcements" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
    await expect(client.announcements.byDepartment(5)).resolves.toEqual([]);
  });

  it("invokes onError for 404 before treat404AsEmpty maps to empty array", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 404, body: { message: "not found" } })
    ]);
    const onError = vi.fn();
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      retries: 0,
      hooks: { onError }
    });
    await expect(client.announcements.byEmployee("v-petrov")).resolves.toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
    const ctx = onError.mock.calls[0]?.[0] as { error: unknown } | undefined;
    expect(ctx?.error).toBeInstanceOf(BsuirApiError);
    expect((ctx?.error as BsuirApiError).status).toBe(404);
  });

  it("returns announcements for department", async () => {
    const body = [{ id: 2, text: "Расписание" }];
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const result = await client.announcements.byDepartment(5);
    expect(result).toHaveLength(1);
  });

  it("unwraps empty content array from paginated envelope", async () => {
    const body = {
      content: [],
      totalElements: 0,
      totalPages: 0,
      last: true
    };
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl });
    await expect(client.announcements.byDepartment(1)).resolves.toEqual([]);
  });

  it("fetches all pages and concatenates announcement content", async () => {
    const page0 = {
      content: [{ id: 1 }, { id: 2 }],
      pageable: { pageNumber: 0, pageSize: 2 },
      totalElements: 5,
      totalPages: 3,
      last: false,
      size: 2,
      number: 0
    };
    const page1 = {
      content: [{ id: 3 }, { id: 4 }],
      pageable: { pageNumber: 1, pageSize: 2 },
      totalElements: 5,
      totalPages: 3,
      last: false,
      size: 2,
      number: 1
    };
    const page2 = {
      content: [{ id: 5 }],
      pageable: { pageNumber: 2, pageSize: 2 },
      totalElements: 5,
      totalPages: 3,
      last: true,
      size: 2,
      number: 2
    };
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: page0 }),
      createJsonResponse({ body: page1 }),
      createJsonResponse({ body: page2 })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const secondUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]);
    const thirdUrl = String((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[2]?.[0]);
    expect(secondUrl).toContain("page=1");
    expect(secondUrl).toContain("size=2");
    expect(secondUrl).toContain("url-id=v-petrov");
    expect(thirdUrl).toContain("page=2");
    expect(thirdUrl).toContain("size=2");
  });

  it("does not request further pages when totalPages is 1", async () => {
    const body = {
      content: [{ id: 1 }],
      pageable: { pageNumber: 0, pageSize: 20 },
      totalElements: 1,
      totalPages: 1,
      last: true
    };
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl });
    await expect(client.announcements.byEmployee("v-petrov")).resolves.toEqual([{ id: 1 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws BsuirConfigurationError when totalPages exceeds safety cap", async () => {
    const { BsuirConfigurationError } = await import("../../src/client/errors");
    const body = {
      content: [{ id: 1 }],
      pageable: { pageNumber: 0, pageSize: 20 },
      totalElements: 2000,
      totalPages: 51,
      last: false
    };
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
    await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(
      BsuirConfigurationError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps treat404AsEmpty on the first request only", async () => {
    const page0 = {
      content: [{ id: 1 }],
      pageable: { pageNumber: 0, pageSize: 1 },
      totalElements: 2,
      totalPages: 2,
      last: false,
      size: 1,
      number: 0
    };
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: page0 }),
      createJsonResponse({ status: 404, body: { message: "not found" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, retries: 0 });
    await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(BsuirApiError);
  });
});
