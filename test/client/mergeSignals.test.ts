import { describe, expect, it, vi } from "vitest";
import { mergeSignalsManual } from "../../src/client/mergeSignals";

describe("mergeSignalsManual", () => {
  it("aborts merged signal after timeout when no caller signal is passed", async () => {
    vi.useFakeTimers();
    try {
      const merged = mergeSignalsManual(undefined, 500);
      expect(merged.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(merged.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts merged signal when caller signal aborts and clears the timeout", async () => {
    vi.useFakeTimers();
    try {
      const parent = new AbortController();
      const merged = mergeSignalsManual(parent.signal, 60_000);
      parent.abort();
      expect(merged.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(merged.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an already-aborted merged signal when caller is already aborted", () => {
    const parent = new AbortController();
    parent.abort();
    const merged = mergeSignalsManual(parent.signal, 60_000);
    expect(merged.aborted).toBe(true);
  });
});
