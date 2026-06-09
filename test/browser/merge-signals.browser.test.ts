import { describe, expect, it } from "vitest";
import { getMergedSignalCleanup, mergeSignals } from "../../src/client/mergeSignals";

describe("browser — platform AbortSignal.any", () => {
  it("uses native AbortSignal.any when available", () => {
    expect(typeof AbortSignal.any).toBe("function");
  });

  it("does not attach manual cleanup when platform merge is used", () => {
    const caller = new AbortController();
    const merged = mergeSignals([caller.signal], 60_000);
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
