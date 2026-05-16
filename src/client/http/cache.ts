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
  // Touch key to move it to the end (most recently used).
  config.responseCache.delete(key);
  config.responseCache.set(key, entry);
  return entry.value;
}

/**
 * Writes response value to cache and performs expiration/LRU eviction.
 */
export function setCache(
  config: Readonly<InternalClientConfig>,
  key: string,
  value: unknown
): void {
  if (config.cacheTtlMs === undefined) {
    return;
  }
  const now = Date.now();

  // Re-insert to mark as most recently used.
  config.responseCache.delete(key);
  config.responseCache.set(key, {
    value,
    expiresAt: now + config.cacheTtlMs
  });

  // Remove expired entries first.
  for (const [k, v] of config.responseCache) {
    if (v.expiresAt <= now) {
      config.responseCache.delete(k);
    }
  }

  if (config.responseCache.size <= config.cacheMaxEntries) {
    return;
  }

  // Evict least-recently-used entries using insertion order.
  for (const k of config.responseCache.keys()) {
    if (config.responseCache.size <= config.cacheMaxEntries) {
      break;
    }
    config.responseCache.delete(k);
  }
}
