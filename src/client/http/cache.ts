import type { InternalClientConfig } from "../types";

/**
 * Reads a cached response value by key, applying TTL validation and LRU touch update.
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
  // Update accessedAt on every read so LRU eviction keeps frequently-used entries alive.
  entry.accessedAt = Date.now();
  return entry.value;
}

/**
 * Writes response value to cache and performs eviction when size approaches capacity.
 */
export function setCache(config: Readonly<InternalClientConfig>, key: string, value: unknown): void {
  if (config.cacheTtlMs === undefined) {
    return;
  }
  const now = Date.now();

  // Re-insert to refresh insertion order in the Map (used as tie-breaker after accessedAt sort).
  config.responseCache.delete(key);
  config.responseCache.set(key, {
    value,
    expiresAt: now + config.cacheTtlMs,
    accessedAt: now,
  });

  // Only trigger cleanup when cache is approaching capacity (>90%) to avoid O(n) scan on every set.
  const cleanupThreshold = config.cacheMaxEntries * 0.9;
  if (config.responseCache.size <= cleanupThreshold) {
    return;
  }

  // Remove expired entries first — cheapest cleanup, no sorting needed.
  for (const [k, v] of config.responseCache) {
    if (v.expiresAt <= now) {
      config.responseCache.delete(k);
    }
  }

  // True LRU eviction: sort all remaining entries by accessedAt ascending and
  // drop the least-recently-used ones until we are within capacity.
  // O(n log n) but only runs when the cache is nearly full, so it is infrequent.
  if (config.responseCache.size > config.cacheMaxEntries) {
    const byLeastRecentlyUsed = [...config.responseCache.entries()].sort(
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
