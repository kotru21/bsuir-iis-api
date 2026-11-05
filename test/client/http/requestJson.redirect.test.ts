import { describe, expect, it, vi } from "vitest";
import { createBsuirClient } from "../../../src";
import { BsuirConfigurationError } from "../../../src/client/errors";
import { createJsonResponse } from "../../helpers/fetchMock";
import { captureRejection } from "../../helpers/captureRejection";

/** A response as `fetch` returns it after following redirects to `finalUrl`. */
function redirectedResponse(finalUrl: string, body: unknown): Response {
  const response = createJsonResponse({ body });
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: finalUrl }
  });
  return response;
}

describe("requestJson — redirect host policy", () => {
  // `fetch` follows redirects by itself; without this check a 3xx could hand the
  // client data from any host and bypass allowedBaseUrlHosts.
  it("rejects a response redirected to a host outside the allowlist, without retrying", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectedResponse("https://evil.example.com/api/v1/faculties", [])
    ) as unknown as typeof fetch;
    const onError = vi.fn();
    const client = createBsuirClient({ fetch: fetchImpl, retries: 2, hooks: { onError } });

    const error: unknown = await captureRejection(client.faculties.listAll());
    expect(error).toBeInstanceOf(BsuirConfigurationError);
    expect((error as Error).message).toMatch(
      /redirected to https:\/\/evil\.example\.com.*not in allowedBaseUrlHosts/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("rejects an HTTPS → HTTP downgrade on the allowed host", async () => {
    const fetchImpl = vi.fn(async () =>
      // eslint-disable-next-line unicorn/prefer-https -- testing downgrade rejection
      redirectedResponse("http://iis.bsuir.by/api/v1/faculties", [])
    ) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });
    await expect(client.faculties.listAll()).rejects.toThrow(/allowInsecureHttp/);
  });

  it("accepts redirects that stay on an allowed host", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectedResponse("https://iis.bsuir.by/api/v1/faculties/", [{ id: 1 }])
    ) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });
    await expect(client.faculties.listAll()).resolves.toEqual([{ id: 1 }]);
  });
});
