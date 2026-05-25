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

  it("skips validation when validateResponses: false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    const result = await client.announcements.byEmployee("v-petrov");
    expect(result).toEqual({ not: "array" });
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
});
