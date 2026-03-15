import { describe, expect, it } from "vitest";
import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirTimeoutError,
  BsuirValidationError,
  createBsuirClient
} from "../../src";

describe("public api", () => {
  it("exports createBsuirClient and error classes", () => {
    const client = createBsuirClient({
      fetch: (async () => new Response(JSON.stringify(2), { status: 200 })) as typeof fetch
    });

    expect(client).toHaveProperty("schedule");
    expect(BsuirApiError).toBeDefined();
    expect(BsuirNetworkError).toBeDefined();
    expect(BsuirTimeoutError).toBeDefined();
    expect(BsuirValidationError).toBeDefined();
  });
});
