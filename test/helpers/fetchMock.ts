import { vi } from "vitest";

export interface MockResponseInit {
  status?: number;
  headers?: HeadersInit;
  body: unknown;
}

export function createJsonResponse({ status = 200, headers, body }: MockResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {})
    }
  });
}

export function mockFetchSequence(responses: Array<Response | Error>): typeof globalThis.fetch {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) {
      throw new Error("No mock response left");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as unknown as typeof globalThis.fetch;
}
