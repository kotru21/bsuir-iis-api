import { describe, expect, it, vi } from "vitest";
import {
  getMergedSignalCleanup,
  mergeSignals,
  mergeSignalsManual
} from "../../src/client/mergeSignals";

describe("mergeSignals — additional branches", () => {
  // line 44 — parts.length === 0 && timeout === undefined → returns never-abort signal
  it("returns a never-abort signal when called with empty array and no timeout (line 44)", () => {
    const signal = mergeSignals([]);
    expect(signal.aborted).toBe(false);
  });

  it("returns a never-abort signal when called with [undefined] and no timeout", () => {
    const signal = mergeSignals([undefined as unknown as AbortSignal]);
    expect(signal.aborted).toBe(false);
  });

  it("returns timeout signal when parts empty but timeout provided", () => {
    const signal = mergeSignals([], 100_000);
    expect(signal.aborted).toBe(false);
  });

  it("registers cleanup that clears timeout timers (including AbortSignal.any path)", () => {
    vi.useFakeTimers();
    try {
      const ctrl = new AbortController();
      const merged = mergeSignals([ctrl.signal], 60_000);
      const cleanup = getMergedSignalCleanup(merged);
      expect(cleanup).toBeTypeOf("function");
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      cleanup!();
      expect(vi.getTimerCount()).toBe(0);
      expect(merged.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("registers cleanup for timeout-only merge", () => {
    vi.useFakeTimers();
    try {
      const merged = mergeSignals([], 60_000);
      const cleanup = getMergedSignalCleanup(merged);
      expect(cleanup).toBeTypeOf("function");
      cleanup!();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the single signal directly when no timeout", () => {
    const ctrl = new AbortController();
    const result = mergeSignals([ctrl.signal]);
    // identity or equivalent — must not be aborted
    expect(result.aborted).toBe(false);
    ctrl.abort();
    // original aborted
    expect(ctrl.signal.aborted).toBe(true);
  });

  it("mergesSignalsManual: empty signals no timeout → never-abort signal", () => {
    const signal = mergeSignalsManual([]);
    expect(signal.aborted).toBe(false);
  });

  it("mergeSignalsManual: aborts when one input signal already aborted", () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const result = mergeSignalsManual([ctrl.signal, new AbortController().signal]);
    expect(result.aborted).toBe(true);
  });

  it("mergeSignalsManual: aborts when input signal fires after combine", async () => {
    const ctrl = new AbortController();
    const result = mergeSignalsManual([ctrl.signal]);
    // single signal no timeout → returned directly
    expect(result).toBe(ctrl.signal);
  });

  it("mergeSignalsManual: combined aborts on timeout", async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const result = mergeSignalsManual([ctrl.signal], 50);
    expect(result.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(result.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("mergeSignalsManual: clears timeout immediately when one signal is already aborted", () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    ctrl.abort();

    const result = mergeSignalsManual([ctrl.signal, new AbortController().signal], 10_000);
    expect(result.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
