---
"bsuir-iis-api": patch
---

HTTP pipeline fixes:

- Cancelling with a custom reason (`controller.abort(new Error(...))` or `abort("...")`) now rejects with that reason instead of being retried and surfaced as `BsuirNetworkError`. A cancellation during retry backoff no longer fires `onRequest` for an attempt that is never sent.
- `hooks.onError` now fires for invalid JSON in a 2xx response (previously skipped), and exactly once per failure. Errors thrown while reading the body report the request endpoint even when a custom `fetch` returns a `Response` without `url`.
- Text error bodies are shown in `BsuirApiError.message` as a one-line preview capped at 300 characters; the full body stays in `error.body`.
- Response cache eviction never drops the entry that was just written. Stores that iterate newest-first (e.g. `lru-cache`) previously evicted every new write once full; the README now shows how to use `lru-cache` safely.
- With `dedupeInFlight`, responses shared between concurrent callers are now deep-frozen (like cache hits), so one caller can no longer mutate another caller's result. Without `cache`/`dedupeInFlight` payloads stay mutable.
