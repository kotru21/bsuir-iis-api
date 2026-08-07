---
"bsuir-iis-api": minor
---

Hardening and consistency wave across the HTTP engine and normalization:

- Lifecycle hooks (`onRequest`/`onRetry`/`onResponse`/`onError`) are now invoked safely: a throwing observability callback can no longer break the request, trigger a retry of an already-finished exchange, or mask the real error.
- `validateResponses` now validates schedule payloads down to every lesson item (`schedules` / `nextSchedules` / `exams`) and announcement lists down to each item; catalog items are checked as objects. Fields are validated when present, since IIS may omit keys on sparse payloads.
- Normalized schedule payloads are now consistently deep-frozen across all views (`lessons`, `lessonsByDay`, `scheduleLessons`, `examLessons`, `schedules`, `exams`) — mutating any part throws `TypeError` in strict mode. The raw `ScheduleResponse` passed to `normalizeSchedule()` is never mutated or frozen; normalization works on an owned deep clone.
- Retry decisions for retriable HTTP statuses are now made before the error body is read, so an oversized error page no longer disables retries by surfacing `BsuirResponsePayloadTooLargeError`. Abandoned response bodies are cancelled to free keep-alive connections.
- `Retry-After` is honored in full up to a 60 s safety ceiling instead of being capped by `retryMaxDelayMs` (which now caps only the SDK's own exponential backoff). Retry waits are abort-aware: a caller abort interrupts the wait immediately instead of stalling until the delay elapses.
- Cache-hit `onResponse` contexts now report the original response status instead of a hardcoded `200`.
- `baseUrl` with an explicit port is now accepted on loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) for local dev/mock servers; ports remain rejected for public hosts.
- Query keys are now sorted by code point (locale-independent), so cache keys are deterministic across runtimes.
