import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../../src/client/http";
import { BsuirApiError } from "../../../src/client/errors";
import type { ErrorHookContext, ResponseHookContext } from "../../../src/client/types";
import { createJsonResponse } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

/** Fetch whose responses the test resolves by hand; rejects like real fetch on abort. */
function createDeferredFetch() {
  const calls: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (!signal) {
      throw new Error("expected a request signal");
    }
    return new Promise<Response>((resolve, reject) => {
      calls.push({ signal, resolve });
      signal.addEventListener(
        "abort",
        () => {
          reject(signal.reason as Error);
        },
        { once: true }
      );
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function call(index: number, calls: ReturnType<typeof createDeferredFetch>["calls"]) {
  const entry = calls[index];
  if (!entry) {
    throw new Error(`fetch call #${String(index)} was not made`);
  }
  return entry;
}

describe("requestJson — dedup with per-call signals", () => {
  it("shares one request between callers with different per-call signals", async () => {
    const { fetchImpl, calls } = createDeferredFetch();
    const config = createRequestJsonConfig(fetchImpl);

    const first = requestJson<number[]>(config, "/faculties", {
      signal: new AbortController().signal
    });
    const second = requestJson<number[]>(config, "/faculties", {
      signal: new AbortController().signal
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    call(0, calls).resolve(createJsonResponse({ body: [1] }));
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("lets one caller stop waiting without cancelling the request for the others", async () => {
    const { fetchImpl, calls } = createDeferredFetch();
    const config = createRequestJsonConfig(fetchImpl);
    const leaving = new AbortController();
    const reason = new Error("user navigated away");

    const first = requestJson(config, "/faculties", { signal: leaving.signal });
    const second = requestJson<number[]>(config, "/faculties", {
      signal: new AbortController().signal
    });

    leaving.abort(reason);
    await expect(first).rejects.toBe(reason);
    expect(call(0, calls).signal.aborted).toBe(false);

    call(0, calls).resolve(createJsonResponse({ body: [2] }));
    await expect(second).resolves.toEqual([2]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cancels the shared request once every waiting caller has aborted", async () => {
    const { fetchImpl, calls } = createDeferredFetch();
    const config = createRequestJsonConfig(fetchImpl);
    const ctrlA = new AbortController();
    const ctrlB = new AbortController();
    const reasonA = new Error("A");
    const reasonB = new Error("B");

    const first = requestJson(config, "/faculties", { signal: ctrlA.signal });
    const second = requestJson(config, "/faculties", { signal: ctrlB.signal });

    ctrlA.abort(reasonA);
    ctrlB.abort(reasonB);
    expect(call(0, calls).signal.aborted).toBe(true);
    await expect(first).rejects.toBe(reasonA);
    await expect(second).rejects.toBe(reasonB);

    // The cancelled entry is gone: the next caller starts a fresh request.
    const third = requestJson<number[]>(config, "/faculties");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    call(1, calls).resolve(createJsonResponse({ body: [3] }));
    await expect(third).resolves.toEqual([3]);
    expect(config.inFlightRequests.size).toBe(0);
  });

  it("keeps the shared request alive while a caller without a signal waits", async () => {
    const { fetchImpl, calls } = createDeferredFetch();
    const config = createRequestJsonConfig(fetchImpl);
    const ctrl = new AbortController();

    const unsignalled = requestJson<number[]>(config, "/faculties");
    const signalled = requestJson(config, "/faculties", { signal: ctrl.signal });

    ctrl.abort(new Error("bye"));
    await expect(signalled).rejects.toThrow("bye");
    expect(call(0, calls).signal.aborted).toBe(false);

    call(0, calls).resolve(createJsonResponse({ body: [4] }));
    await expect(unsignalled).resolves.toEqual([4]);
  });
});

describe("requestJson — dedup hooks", () => {
  it("fires one onResponse per call, flagging the callers that joined", async () => {
    const { fetchImpl, calls } = createDeferredFetch();
    const onRequest = vi.fn();
    const onResponse = vi.fn<(context: ResponseHookContext) => void>();
    const config = createRequestJsonConfig(fetchImpl, { hooks: { onRequest, onResponse } });

    const pending = [
      requestJson(config, "/faculties"),
      requestJson(config, "/faculties"),
      requestJson(config, "/faculties")
    ];
    call(0, calls).resolve(createJsonResponse({ body: [] }));
    await Promise.all(pending);

    expect(onRequest).toHaveBeenCalledTimes(1);
    const flags = onResponse.mock.calls.map(([context]) => context.deduplicated);
    expect(flags.toSorted((a, b) => Number(a) - Number(b))).toEqual([false, true, true]);
    for (const [context] of onResponse.mock.calls) {
      expect(context).toMatchObject({ status: 200, fromCache: false });
    }
  });

  it("fires one onError per call when the shared request fails", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({ status: 500, body: { message: "down" } })
    ) as unknown as typeof fetch;
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const config = createRequestJsonConfig(fetchImpl, { hooks: { onError } });

    const results = await Promise.allSettled([
      requestJson(config, "/faculties"),
      requestJson(config, "/faculties"),
      requestJson(config, "/faculties")
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(BsuirApiError);
    }
    const flags = onError.mock.calls.map(([context]) => context.deduplicated);
    expect(flags.toSorted((a, b) => Number(a) - Number(b))).toEqual([false, true, true]);
  });

  it("reports a joined caller's own abort as its onError", async () => {
    const { fetchImpl, calls } = createDeferredFetch();
    const onError = vi.fn<(context: ErrorHookContext) => void>();
    const config = createRequestJsonConfig(fetchImpl, { hooks: { onError } });
    const ctrl = new AbortController();
    const reason = new Error("cancelled");

    const leader = requestJson(config, "/faculties");
    const joined = requestJson(config, "/faculties", { signal: ctrl.signal });
    ctrl.abort(reason);
    await expect(joined).rejects.toBe(reason);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ error: reason, deduplicated: true });

    call(0, calls).resolve(createJsonResponse({ body: [] }));
    await leader;
  });
});
