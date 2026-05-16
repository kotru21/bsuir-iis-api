import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCache, tryReadCache } from "../../../src/client/http/cache";
import { BsuirConfigurationError } from "../../../src/client/errors";
import type { InternalClientConfig } from "../../../src/client/types";

function makeConfig(overrides: Partial<InternalClientConfig> = {}): InternalClientConfig {
  return {
    baseUrl: "https://iis.bsuir.by/api/v1",
    fetchImpl: fetch,
    signal: undefined,
    timeoutMs: 10_000,
    retries: 1,
    retryDelayMs: 300,
    retryMaxDelayMs: 3000,
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
    ...overrides
  };
}

describe("tryReadCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns undefined for cache miss", () => {
    const config = makeConfig();
    expect(tryReadCache(config, "key")).toBeUndefined();
  });

  it("returns value and touches key as most recently used", () => {
    vi.setSystemTime(1000);
    const config = makeConfig({ cacheMaxEntries: 2 });
    setCache(config, "k1", 1);
    setCache(config, "k2", 2);

    expect(tryReadCache(config, "k1")).toBe(1);

    setCache(config, "k3", 3);
    expect(config.responseCache.has("k1")).toBe(true);
    expect(config.responseCache.has("k2")).toBe(false);
    expect(config.responseCache.has("k3")).toBe(true);
  });

  it("returns a deeply-frozen value so cache hits cannot mutate shared entries", () => {
    const config = makeConfig();
    setCache(config, "k1", { nested: { value: 1 }, items: [1, 2] });

    const cached = tryReadCache(config, "k1") as { nested: { value: number }; items: number[] };
    expect(Object.isFrozen(cached)).toBe(true);
    expect(Object.isFrozen(cached.nested)).toBe(true);
    expect(Object.isFrozen(cached.items)).toBe(true);

    const cachedAgain = tryReadCache(config, "k1") as { nested: { value: number }; items: number[] };
    expect(cachedAgain).toEqual({ nested: { value: 1 }, items: [1, 2] });
  });

  it("returns undefined and deletes the entry when expired", () => {
    vi.setSystemTime(1000);
    const config = makeConfig();
    config.responseCache.set("key", { value: "stale", expiresAt: 1000 });

    vi.setSystemTime(1001);
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
    vi.setSystemTime(1000);
    const config = makeConfig({ cacheTtlMs: 500 });
    setCache(config, "key", 42);

    const entry = config.responseCache.get("key");
    expect(entry?.value).toBe(42);
    expect(entry?.expiresAt).toBe(1500);
  });

  it("re-inserts existing key to refresh order", () => {
    vi.setSystemTime(1000);
    const config = makeConfig({ cacheTtlMs: 1000 });
    setCache(config, "key", "v1");
    vi.setSystemTime(1100);
    setCache(config, "key", "v2");

    expect(config.responseCache.get("key")?.value).toBe("v2");
    expect(config.responseCache.size).toBe(1);
  });

  it("stores a clone so mutating original payload after write does not poison cache", () => {
    const config = makeConfig({ cacheTtlMs: 1000 });
    const payload = { nested: { value: 1 } };
    setCache(config, "key", payload);
    payload.nested.value = 2;

    const cached = tryReadCache(config, "key") as { nested: { value: number } };
    expect(cached.nested.value).toBe(1);
  });

  it("evicts expired entries before capacity-based eviction", () => {
    vi.setSystemTime(1000);
    const config = makeConfig({ cacheTtlMs: 60_000, cacheMaxEntries: 2 });
    config.responseCache.set("expired", { value: "old", expiresAt: 999 });
    setCache(config, "k1", 1);
    setCache(config, "k2", 2);

    expect(config.responseCache.has("expired")).toBe(false);
    expect(config.responseCache.size).toBe(2);
  });

  it("rejects non-JSON values (Date, Map, class instances)", () => {
    const config = makeConfig({ cacheTtlMs: 1000 });
    expect(() => setCache(config, "k", new Date())).toThrow(BsuirConfigurationError);
    expect(() => setCache(config, "k", new Map())).toThrow(BsuirConfigurationError);
    class Foo {
      readonly tag = "foo";
    }
    expect(() => setCache(config, "k", new Foo())).toThrow(BsuirConfigurationError);
    expect(() => setCache(config, "k", Number.NaN)).toThrow(BsuirConfigurationError);
    expect(() => setCache(config, "k", Number.POSITIVE_INFINITY)).toThrow(
      BsuirConfigurationError
    );
  });

  it("evicts least-recently-used entries when cache exceeds maxEntries", () => {
    vi.setSystemTime(1000);
    const config = makeConfig({ cacheTtlMs: 60_000, cacheMaxEntries: 3 });
    setCache(config, "lru1", 1);
    setCache(config, "lru2", 2);
    setCache(config, "lru3", 3);

    setCache(config, "lru4", 4);

    expect(config.responseCache.has("lru1")).toBe(false);
    expect(config.responseCache.has("lru2")).toBe(true);
    expect(config.responseCache.has("lru4")).toBe(true);
    expect(config.responseCache.size).toBe(3);
  });
});
