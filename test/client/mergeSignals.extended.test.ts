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

  it("clears timeout when an external signal aborts first", async () => {
    vi.useFakeTimers();
    try {
      const ctrl = new AbortController();
      const combined = mergeSignalsManual([ctrl.signal], 10_000);
      ctrl.abort();
      expect(combined.aborted).toBe(true);
      // Advancing past the timeout should not throw or cause issues
      await vi.advanceTimersByTimeAsync(10_000);
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
    expect(result.aborted).toBe(false);
    ctrl.abort();
    expect(result.aborted).toBe(true);
  });

  it("aborts when one of two signals aborts (no timeout)", () => {
    const a = new AbortController();
    const b = new AbortController();
    const result = mergeSignals([a.signal, b.signal]);
    expect(result.aborted).toBe(false);
    a.abort();
    expect(result.aborted).toBe(true);
  });

  it("supports legacy single-signal signature", () => {
    const ctrl = new AbortController();
    const result = mergeSignals(ctrl.signal);
    expect(result.aborted).toBe(false);
    ctrl.abort();
    expect(result.aborted).toBe(true);
  });

  it("supports legacy single-signal with undefined", () => {
    const result = mergeSignals(undefined);
    expect(result.aborted).toBe(false);
  });
});
