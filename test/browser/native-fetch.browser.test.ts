import { describe, expect, it } from "vitest";
import {
  BsuirApiError,
  BsuirNetworkError,
  BsuirResponseValidationError,
  createBsuirClient
} from "../../src";

/**
 * The other browser suites inject stub `fetch` functions, which accept any `this`.
 * Native browser `fetch` throws "Illegal invocation" unless it is called without a
 * receiver (or on `window`), so these tests go through the real implementation
 * against the Vitest dev server origin. Any HTTP-level outcome proves the request
 * was actually sent; a `BsuirNetworkError` would mean `fetch` itself was rejected.
 */
function createLocalClient(fetchOption?: typeof fetch) {
  return createBsuirClient({
    ...(fetchOption === undefined ? {} : { fetch: fetchOption }),
    baseUrl: `${location.origin}/__bsuir_native_fetch_probe__`,
    allowedBaseUrlHosts: [location.hostname],
    allowInsecureHttp: location.protocol === "http:",
    retries: 0
  });
}

async function captureFailure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectHttpLevelOutcome(error: unknown): void {
  expect(error).not.toBeInstanceOf(BsuirNetworkError);
  expect(
    error instanceof BsuirApiError || error instanceof BsuirResponseValidationError,
    `expected an HTTP-level failure, got ${String(error)}`
  ).toBe(true);
}

describe("native browser fetch", () => {
  it("works with the default global fetch", async () => {
    const client = createLocalClient();
    expectHttpLevelOutcome(await captureFailure(() => client.faculties.listAll()));
  });

  it("works with window.fetch passed explicitly", async () => {
    // oxlint-disable-next-line unicorn/prefer-global-this -- passing the unbound native method is the scenario under test
    const client = createLocalClient(window.fetch);
    expectHttpLevelOutcome(await captureFailure(() => client.faculties.listAll()));
  });
});
