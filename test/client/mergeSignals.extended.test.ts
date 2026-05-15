import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeSignals, mergeSignalsManual } from "../../src/client/mergeSignals";

describe("mergeSignalsManual — additional branches", () => {
  it("returns a never-aborted signal when called with no signals and no timeout", () => {
    const signal = mergeSignalsManual([]);
    expect(signal.aborted).toBe(false);
  });

  it("returns the same signal when called with a single signal and no timeout", () => {
    const ctrl = new AbortController();
    const result = mergeSignalsManual([ctrl.signal]);
    expect(result).toBe(ctrl.signal);
  });

  it("aborts combined signal when second of two signals aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = mergeSignalsManual([a.signal, b.signal]);
    expect(combined.aborted).toBe(false);
    b.abort();
    expect(combined.aborted).toBe(true);
  });

  it("does not double-abort when combined is already aborted", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = mergeSignalsManual([a.signal, b.signal]);
    a.abort();
    expect(combined.aborted).toBe(true);
    // second abort should be a no-op (no throw)
    expect(() => b.abort()).not.toThrow();
  });

  it("timeout fires and aborts combined even without external signals", async () => {
    vi.useFakeTimers();
    try {
      const combined = mergeSignalsManual([], 200);
      expect(combined.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(combined.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mergeSignals — public API branches", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a never-aborted signal for empty array and no timeout", () => {
    const signal = mergeSignals([]);
    expect(signal.aborted).toBe(false);
  });

  it("returns the single signal directly when no timeout", () => {
    const ctrl = new AbortController();
    const result = mergeSignals([ctrl.signal]);
    // Either same reference or functionally identical
    expect(result.aborted).toBe(false);
    ctrl.abort();
    // If returned by ref, aborted; if wrapped, still aborted via event
    // Just ensure no error is thrown and signal is eventually aborted
    expect(result.aborted).toBe(true);
  });

  it("returns an aborted signal for empty array with timeout=0", async () => {
    const signal = mergeSignals([], 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(signal.aborted).toBe(true);
  });

  it("supports legacy single-signal signature", () => {
    const ctrl = new AbortController();
    const result = mergeSignals(ctrl.signal);
    expect(result.aborted).toBe(false);
  });
});
