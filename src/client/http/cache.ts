import type { InternalClientConfig } from "../types";
import { deepFreezeJson } from "../../utils/deepFreezeJson";

/** Cached entry returned by {@link tryReadCacheEntry} (value plus original HTTP status). */
export interface CacheHit {
  value: unknown;
  /** Status of the original response; `undefined` for entries written without one. */
  status: number | undefined;
}

/**
 * Reads a cached response entry by key, applying TTL validation and LRU touch update.
 *
 * Returns the cached value directly (deep-frozen on write) instead of cloning on every
 * read, together with the original HTTP status so cache-hit observability reports
 * the real status instead of a placeholder. Callers that need a mutable copy must
 * clone explicitly. This avoids paying structuredClone() cost on every cache hit,
 * which can dominate latency for large schedule payloads on a hot cache path.
 */
export function tryReadCacheEntry(
  config: Readonly<InternalClientConfig>,
  key: string
): CacheHit | undefined {
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
  return { value: entry.value, status: entry.status };
}

/**
 * Writes response value to cache and performs expiration/LRU eviction.
 *
 * Values are parsed response bodies (`JSON.parse` output, a text body or `null`),
 * so they are always JSON-compatible.
 */
export function setCache<T>(
  config: Readonly<InternalClientConfig>,
  key: string,
  value: T,
  status?: number
): T | undefined {
  if (config.cacheTtlMs === undefined) {
    return undefined;
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
    status,
    expiresAt: now + config.cacheTtlMs
  });

  if (config.responseCache.size <= config.cacheMaxEntries) {
    return frozen;
  }

  // Remove expired entries before capacity-based eviction, but only when oversized.
  for (const [k, v] of config.responseCache.entries()) {
    if (v.expiresAt <= now) {
      config.responseCache.delete(k);
    }
  }

  if (config.responseCache.size <= config.cacheMaxEntries) {
    return frozen;
  }

  // Evict least-recently-used entries using insertion order. Never evict the entry just
  // written: stores that iterate newest-first (e.g. lru-cache) would otherwise drop every
  // new write once full.
  for (const k of config.responseCache.keys()) {
    if (config.responseCache.size <= config.cacheMaxEntries) {
      break;
    }
    if (k !== key) {
      config.responseCache.delete(k);
    }
  }

  return frozen;
}
