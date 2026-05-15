import type { InternalClientConfig } from "../types";

export interface CacheEntry {
  value: unknown;
  expiresAt: number;
  accessedAt: number;
}

/**
 * Reads a cached value for the given key.
 * Returns `undefined` on miss or when the entry has expired (and removes it).
 */
export function tryReadCache(config: Readonly<InternalClientConfig>, key: string): unknown {
  const entry = config.responseCache.get(key);
  if (!entry) return undefined;

  const now = Date.now();
  if (now >= entry.expiresAt) {
    config.responseCache.delete(key);
    return undefined;
  }

  entry.accessedAt = now;
  return entry.value;
}

/**
 * Writes a value to the cache under the given key.
 * Does nothing when `cacheTtlMs` is not configured.
 * Evicts expired entries first; if still over capacity, evicts least-recently-used entries.
 */
export function setCache(config: Readonly<InternalClientConfig>, key: string, value: unknown): void {
  if (config.cacheTtlMs === undefined) return;

  const now = Date.now();

  // Re-insert to update insertion order (Map preserves insertion order).
  config.responseCache.delete(key);
  config.responseCache.set(key, {
    value,
    expiresAt: now + config.cacheTtlMs,
    accessedAt: now
  });

  const threshold = Math.floor(config.cacheMaxEntries * 0.9);
  if (config.responseCache.size <= threshold) return;

  // First pass: evict all expired entries (cheap O(n) sweep).
  for (const [k, entry] of config.responseCache) {
    if (now >= entry.expiresAt) {
      config.responseCache.delete(k);
    }
  }

  // True LRU eviction: sort all remaining entries by accessedAt ascending and
  // drop the least-recently-used ones until we are within capacity.
  // O(n log n) but only runs when the cache is nearly full, so it is infrequent.
  if (config.responseCache.size > config.cacheMaxEntries) {
    const byLeastRecentlyUsed = [...config.responseCache.entries()].toSorted(
      (a, b) => a[1].accessedAt - b[1].accessedAt,
    );
    for (const [k] of byLeastRecentlyUsed) {
      if (config.responseCache.size <= config.cacheMaxEntries) {
        break;
      }
      config.responseCache.delete(k);
    }
  }
}
