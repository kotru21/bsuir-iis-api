import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCache, tryReadCache } from "../../../src/client/http/cache";
import type { InternalClientConfig } from "../../../src/client/types";

function makeConfig(
  overrides: Partial<InternalClientConfig> = {},
): InternalClientConfig {
  return {
    baseUrl: "https://iis.bsuir.by/api/v1",
    fetchImpl: fetch,
    signal: undefined,
    timeoutMs: 10_000,
    retries: 1,
    retryDelayMs: 300,
    retryMaxDelayMs: 3_000,
    retryJitter: true,
    userAgent: undefined,
    cacheTtlMs: 60_000,
    cacheMaxEntries: 10,
    dedupeInFlight: true,
    maxResponseBytes: 5_000_000,
    validateResponses: false,
    hooks: {},
    responseCache: new Map(),
    inFlightRequests: new Map(),
    defaultRaw: false,
    ...overrides,
  };
}

describe("tryReadCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns undefined for cache miss", () => {
    const config = makeConfig();
    expect(tryReadCache(config, "key")).toBeUndefined();
  });

  it("returns value and updates accessedAt on hit", () => {
    vi.setSystemTime(1_000);
    const config = makeConfig();
    config.responseCache.set("key", { value: { ok: true }, expiresAt: 2_000, accessedAt: 1_000 });

    vi.setSystemTime(1_500);
    expect(tryReadCache(config, "key")).toEqual({ ok: true });

    const entry = config.responseCache.get("key");
    expect(entry?.accessedAt).toBe(1_500);
  });

  it("returns undefined and deletes the entry when expired", () => {
    vi.setSystemTime(1_000);
    const config = makeConfig();
    config.responseCache.set("key", { value: "stale", expiresAt: 1_000, accessedAt: 500 });

    vi.setSystemTime(1_001);
    expect(tryReadCache(config, "key")).toBeUndefined();
    expect(config.responseCache.has("key")).toBe(false);
  });
});

describe("setCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing when cacheTtlMs is undefined", () => {
    const config = makeConfig({ cacheTtlMs: undefined });
    setCache(config, "key", "value");
    expect(config.responseCache.size).toBe(0);
  });

  it("writes an entry with correct expiresAt", () => {
    vi.setSystemTime(1_000);
    const config = makeConfig({ cacheTtlMs: 500 });
    setCache(config, "key", 42);

    const entry = config.responseCache.get("key");
    expect(entry?.value).toBe(42);
    expect(entry?.expiresAt).toBe(1_500);
  });

  it("re-inserts existing key to refresh order", () => {
    vi.setSystemTime(1_000);
    const config = makeConfig({ cacheTtlMs: 1_000 });
    setCache(config, "key", "v1");
    vi.setSystemTime(1_100);
    setCache(config, "key", "v2");

    expect(config.responseCache.get("key")?.value).toBe("v2");
    expect(config.responseCache.size).toBe(1);
  });

  it("does not evict when size is within 90% threshold", () => {
    vi.setSystemTime(1_000);
    // cacheMaxEntries=10, threshold = 9; adding 9 entries → size === threshold, no eviction
    const config = makeConfig({ cacheTtlMs: 60_000, cacheMaxEntries: 10 });
    for (let i = 0; i < 9; i++) {
      setCache(config, `k${String(i)}`, i);
    }
    expect(config.responseCache.size).toBe(9);
  });

  it("evicts expired entries when cache exceeds 90% capacity", () => {
    vi.setSystemTime(1_000);
    const config = makeConfig({ cacheTtlMs: 60_000, cacheMaxEntries: 10 });

    // Fill 9 entries (fresh)
    for (let i = 0; i < 9; i++) {
      setCache(config, `fresh${String(i)}`, i);
    }

    // Add one expired entry manually
    config.responseCache.set("expired", { value: "old", expiresAt: 999, accessedAt: 500 });
    expect(config.responseCache.size).toBe(10);

    // This set pushes size > threshold (10 > 9), triggers cleanup
    vi.setSystemTime(2_000);
    setCache(config, "new", "new");

    expect(config.responseCache.has("expired")).toBe(false);
    expect(config.responseCache.has("new")).toBe(true);
  });

  it("evicts LRU entries when expired eviction alone is insufficient", () => {
    vi.setSystemTime(1_000);
    const config = makeConfig({ cacheTtlMs: 60_000, cacheMaxEntries: 3 });

    // Add 3 fresh entries with different accessedAt
    config.responseCache.set("lru1", { value: 1, expiresAt: 99_000, accessedAt: 100 });
    config.responseCache.set("lru2", { value: 2, expiresAt: 99_000, accessedAt: 200 });
    config.responseCache.set("lru3", { value: 3, expiresAt: 99_000, accessedAt: 300 });

    // Adding 4th entry: size 4 > cacheMaxEntries 3 → LRU eviction
    setCache(config, "lru4", 4);

    // lru1 had the lowest accessedAt, should be evicted
    expect(config.responseCache.has("lru1")).toBe(false);
    expect(config.responseCache.has("lru4")).toBe(true);
    expect(config.responseCache.size).toBe(3);
  });
});
