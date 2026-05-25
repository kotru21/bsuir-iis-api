import { describe, expect, it, vi } from "vitest";
import {
  BsuirResponseValidationError,
  createBsuirClient,
  type ErrorHookContext
} from "../../../src";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";

describe("requestJson — responseValidator and onError", () => {
  it("calls onError when validateResponses rejects schedule raw payload", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: { schedules: [] }
      })
    ]);
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      hooks: { onError }
    });

    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(onError).toHaveBeenCalledOnce();
    const ctx = onError.mock.calls[0]?.[0];
    expect(ctx?.path).toContain("schedule");
    expect(ctx?.error).toBeInstanceOf(BsuirResponseValidationError);
    expect(ctx?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls onError when validateResponses rejects catalog list payload", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      hooks: { onError }
    });

    await expect(client.faculties.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("calls onError when validateResponses rejects announcements payload", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      hooks: { onError }
    });

    await expect(client.announcements.byEmployee("v-petrov")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it("calls onError when validateResponses rejects last-update payload", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { lastUpdateDate: "" } })]);
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      hooks: { onError }
    });

    await expect(client.schedule.getLastUpdateByGroup({ id: 123 })).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it("does not cache responses that fail responseValidator", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { schedules: [] } }),
      createJsonResponse({
        body: {
          employeeDto: null,
          studentGroupDto: null,
          schedules: {},
          exams: [],
          startDate: null,
          endDate: null,
          startExamsDate: null,
          endExamsDate: null
        }
      })
    ]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      cache: { ttlMs: 60_000, maxEntries: 10 }
    });

    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    const raw = await client.schedule.getGroupRaw("053503");
    expect(raw).toHaveProperty("schedules");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
