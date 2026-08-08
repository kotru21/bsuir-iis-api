import { describe, expect, it } from "vitest";
import { getMergedSignalCleanup, mergeSignals } from "../../src/client/mergeSignals";

describe("browser — platform AbortSignal.any", () => {
  it("uses native AbortSignal.any when available", () => {
    expect(typeof AbortSignal.any).toBe("function");
  });

  it("attaches timeout cleanup when platform AbortSignal.any merge is used", () => {
    const caller = new AbortController();
    const merged = mergeSignals([caller.signal], 60_000);
    const cleanup = getMergedSignalCleanup(merged);
    expect(cleanup).toBeTypeOf("function");
    cleanup!();
  });

  it("does not attach cleanup when platform merge has no timeout", () => {
    const a = new AbortController();
    const b = new AbortController();
    const merged = mergeSignals([a.signal, b.signal]);
    expect(getMergedSignalCleanup(merged)).toBeUndefined();
  });

  it("aborts merged signal when caller aborts", () => {
    const caller = new AbortController();
    const merged = mergeSignals([caller.signal], 60_000);
    expect(merged.aborted).toBe(false);
    caller.abort();
    expect(merged.aborted).toBe(true);
  });
});
