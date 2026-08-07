import { describe, expect, it, vi } from "vitest";
import { createBsuirClient } from "../../../src";

describe("requestJson — dedup + per-call signal", () => {
  it("does not deduplicate in-flight requests when per-call signal is provided", async () => {
    const resolves: Array<(res: unknown) => void> = [];
    const fetchImpl = vi.fn(
      async () =>
        new Promise((res) => {
          resolves.push(res);
        })
    ) as unknown as typeof fetch;

    const client = createBsuirClient({ fetch: fetchImpl, dedupeInFlight: true });

    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();

    const p1 = client.groups.listAll({ signal: ctrl1.signal });
    const p2 = client.groups.listAll({ signal: ctrl2.signal });

    // If dedup is disabled when per-call signal is provided, fetch should be called twice.
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // Resolve both requests to avoid unhandled promises
    for (const resolve of resolves) {
      resolve(Response.json([]));
    }

    await Promise.all([p1, p2]);
  });
});
