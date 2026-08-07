---
"bsuir-iis-api": minor
---

**Pluggable cache store**: `cache.store` accepts any synchronous Map-compatible backend (a shared `Map`, `lru-cache`, or a custom adapter) instead of the SDK-managed per-client `Map`. The SDK still handles TTL, LRU eviction, and entry freezing itself; the store is a plain container and can be shared across client instances. New public types: `CacheStore` and `ResponseCacheEntry`. A malformed store is rejected at client creation with `BsuirConfigurationError`.
