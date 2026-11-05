---
"bsuir-iis-api": major
---

Fix browser usage and a set of correctness issues found in code review. See "3.0.0" in the README migration notes.

- **Browsers and Cloudflare Workers work again.** The SDK called `fetch` with its config object as `this`; native browser/Workers `fetch` rejects that with `TypeError: Illegal invocation`, so every request failed as `BsuirNetworkError` — with the default global `fetch` and with `window.fetch` passed explicitly. `fetch` is now always called without a receiver, and a browser test exercises the real `fetch`.
- **Broken payloads no longer stick in the cache.** `getCurrentWeek()` validates the body before caching (a maintenance page used to be served from cache until the TTL expired), and a cache entry that fails validation on a hit is evicted.
- **A 2xx body labelled JSON that is empty or not valid JSON** throws `BsuirResponseValidationError` (was `BsuirApiError` with `status: 200`); `BsuirApiError` now always means a non-2xx response. Still not retried.
- **`filterLessons({ weekNumber })` / `getLessonsForWeek`** include weekly rows with a `null`/empty `weekNumber` (every-week lessons), consistent with `getLessonsForDate` and `formatLessonWeekNumbers`.
- **Unknown day keys** (e.g. `"Воскресенье"`) in `schedules` are kept in `normalized.schedules` instead of being dropped silently; strict mode rejects non-empty ones so the live contract run surfaces the drift.
- **`buildScheduleDays({ onInvalidTime })`** reports malformed lesson times for every day of the range, once per lesson and field (it reported only today's lessons, twice).
- **`dedupeInFlight` works with per-call signals:** a caller that aborts stops waiting without cancelling the request for others; the shared request is cancelled once every waiting caller has aborted. `ResponseHookContext` / `ErrorHookContext` gain `deduplicated`, and joined callers get their own `onResponse` / `onError`.
- `formatEmployeeShortName` no longer returns a leading space when the last name is empty.
- `fetch` option docs no longer recommend `node-fetch` for unsupported Node.js versions.
