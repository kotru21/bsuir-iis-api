import { describe, expect, it, vi } from "vitest";
import { BsuirConfigurationError, createBsuirClient } from "../../src";
import { createJsonResponse } from "../helpers/fetchMock";

describe("createBsuirClient", () => {
  it("uses custom fetch implementation when provided", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({ body: 2 })) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws BsuirConfigurationError when neither custom nor global fetch is available", () => {
    vi.stubGlobal("fetch", undefined);
    try {
      let caught: unknown;
      try {
        createBsuirClient();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BsuirConfigurationError);
      expect((caught as Error).message).toBe(
        "Global fetch is unavailable. Provide 'fetch' in createBsuirClient options."
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
