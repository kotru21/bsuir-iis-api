import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../../src/client/http";
import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirResponseValidationError
} from "../../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

// Lifecycle hooks are observability: a throwing hook must not break the request,
// trigger a retry of a finished exchange, or mask the real outcome.
describe("requestJson — throwing lifecycle hooks are isolated", () => {
  it("resolves normally when onResponse throws (no retry of a finished request)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { ok: true } })]);
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 2,
      hooks: {
        onResponse: () => {
          throw new Error("metrics sink is down");
        }
      }
    });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original BsuirApiError when onError throws on an HTTP error", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 400, body: { message: "bad request" } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 2,
      hooks: {
        onError: () => {
          throw new Error("error reporter is down");
        }
      }
    });

    let thrown: unknown;
    try {
      await requestJson(config, "/faculties");
      expect.unreachable("request should have thrown");
    } catch (error_) {
      thrown = error_;
    }
    expect(thrown).toBeInstanceOf(BsuirApiError);
    expect((thrown as BsuirApiError).status).toBe(400);
    expect((thrown as Error).message).not.toContain("error reporter is down");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still retries when onRetry throws", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "temporary" } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const onRetry = vi.fn(() => {
      throw new Error("retry logger is down");
    });
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 1,
      hooks: { onRetry }
    });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("proceeds with the request when onRequest throws", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { ok: true } })]);
    const config = createRequestJsonConfig(fetchImpl, {
      hooks: {
        onRequest: () => {
          throw new Error("request logger is down");
        }
      }
    });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not convert a throwing onError into a retried network error", async () => {
    const fetchImpl = mockFetchSequence([new Error("ECONNRESET")]);
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 0,
      hooks: {
        onError: () => {
          throw new Error("error reporter is down");
        }
      }
    });

    let thrown: unknown;
    try {
      await requestJson(config, "/faculties");
      expect.unreachable("request should have thrown");
    } catch (error_) {
      thrown = error_;
    }
    expect(thrown).toBeInstanceOf(BsuirNetworkError);
    expect((thrown as BsuirNetworkError).cause).toBeInstanceOf(Error);
    expect(((thrown as BsuirNetworkError).cause as Error).message).toBe("ECONNRESET");
  });

  it("returns cached value when onResponse throws on a cache hit", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [1, 2, 3] })]);
    let hit = false;
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000,
      hooks: {
        onResponse: (ctx) => {
          if (!ctx.fromCache) {
            return;
          }
          hit = true;
          throw new Error("metrics sink is down");
        }
      }
    });

    await requestJson<number[]>(config, "/student-groups");
    const second = await requestJson<number[]>(config, "/student-groups");

    expect(hit).toBe(true);
    expect(second).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects with the validator error when onError throws during validation", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "an array" } })]);
    const config = createRequestJsonConfig(fetchImpl, {
      responseCache: new Map(),
      hooks: {
        onError: () => {
          throw new Error("error reporter is down");
        }
      }
    });

    await expect(
      requestJson(config, "/student-groups", {
        responseValidator: () => {
          throw new BsuirResponseValidationError("expected array", "/student-groups");
        }
      })
    ).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });
});
