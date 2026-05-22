import { BsuirConfigurationError } from "../errors";
import type { InternalClientConfig } from "../types";

function isJsonValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const t = typeof value;
  if (t === "string" || t === "boolean") {
    return true;
  }
  if (t === "number") {
    return Number.isFinite(value);
  }
  if (t !== "object") {
    return false;
  }
  // Reject typed arrays, Maps, Sets, Dates, etc. structuredClone would handle some of these
  // but the cache layer is designed to hold parsed JSON only; anything else indicates a
  // misconfigured value reaching the cache.
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
    return false;
  }
  return true;
}

function deepFreezeJson<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreezeJson(item);
    }
  } else {
    for (const key of Object.keys(value)) {
      deepFreezeJson((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Reads a cached response value by key, applying TTL validation and LRU touch update.
 *
 * Returns the cached value directly (deep-frozen on write) instead of cloning on every
 * read. Callers that need a mutable copy must clone explicitly. This avoids paying
 * structuredClone() cost on every cache hit, which can dominate latency for large
 * schedule payloads on a hot cache path.
 */
export function tryReadCache(config: Readonly<InternalClientConfig>, key: string): unknown {
  const entry = config.responseCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    config.responseCache.delete(key);
    return undefined;
  }
  // Touch key to move it to the end (most recently used).
  config.responseCache.delete(key);
  config.responseCache.set(key, entry);
  return entry.value;
}

/**
 * Writes response value to cache and performs expiration/LRU eviction.
 *
 * Throws if the value is not a JSON-compatible structure — the cache is designed to
 * hold parsed JSON only, and storing other shapes (Map/Set/Date/typed arrays/class
 * instances) would either fail later on read or silently lose data on
 * structuredClone-based eviction strategies.
 */
export function setCache<T>(
  config: Readonly<InternalClientConfig>,
  key: string,
  value: T
): T | undefined {
  if (config.cacheTtlMs === undefined) {
    return undefined;
  }
  if (!isJsonValue(value)) {
    throw new BsuirConfigurationError(
      "Response cache only accepts JSON-compatible values (object/array/string/finite-number/boolean/null)"
    );
  }
  const now = Date.now();

  // Clone once on write to isolate the cache from later mutations of the caller's
  // payload, then deep-freeze so reads can return the same reference safely without
  // paying structuredClone cost on every hit.
  const frozen = deepFreezeJson(structuredClone(value));

  // Re-insert to mark as most recently used.
  config.responseCache.delete(key);
  config.responseCache.set(key, {
    value: frozen,
    expiresAt: now + config.cacheTtlMs
  });

  if (config.responseCache.size <= config.cacheMaxEntries) {
    return frozen;
  }

  // Remove expired entries before capacity-based eviction, but only when oversized.
  for (const [k, v] of config.responseCache) {
    if (v.expiresAt <= now) {
      config.responseCache.delete(k);
    }
  }

  if (config.responseCache.size <= config.cacheMaxEntries) {
    return frozen;
  }

  // Evict least-recently-used entries using insertion order.
  for (const k of config.responseCache.keys()) {
    if (config.responseCache.size <= config.cacheMaxEntries) {
      break;
    }
    config.responseCache.delete(k);
  }

  return frozen;
}
