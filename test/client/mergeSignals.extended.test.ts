import { describe, expect, it, vi } from "vitest";
import { mergeSignals, mergeSignalsManual } from "../../src/client/mergeSignals";

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

  it("legacy signature: mergeSignals(signal, timeout)", () => {
    const ctrl = new AbortController();
    const result = mergeSignals(ctrl.signal, 100_000);
    expect(result.aborted).toBe(false);
  });
});
