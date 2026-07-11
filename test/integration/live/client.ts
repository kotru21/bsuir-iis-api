import { createBsuirClient } from "../../../src";

export function createLiveClient() {
  return createBsuirClient({
    timeoutMs: 15_000,
    retries: 2,
    retryDelayMs: 400,
    retryMaxDelayMs: 2000,
    retryJitter: true
  });
}

export type LiveClient = ReturnType<typeof createLiveClient>;
