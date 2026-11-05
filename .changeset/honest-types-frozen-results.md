---
"bsuir-iis-api": major
---

Fix live-contract breakage, make types match runtime data, and tidy error classes. See "3.0.0" in the README migration notes.

- **IIS announcement rows no longer break schedules.** IIS now puts rows such as "Последняя лекция в семестре" into timetables with `subject`, `subjectFullName` and `lessonTypeAbbrev` set to `null` (about one group in five in November 2026). `createBsuirClient.strict()` rejected the whole schedule of such groups; it now accepts them. `ScheduleItem.subject` / `subjectFullName` are typed `string | null`. `filterLessons({ subjectQuery })` no longer matches the text "null"/"undefined" on such rows.
- **Every client result is deep-frozen, whatever the options**, and DTO/result types are `readonly`. Previously only cached or deduplicated payloads were frozen, so `(await client.groups.listAll()).sort()` worked without a cache and threw `TypeError` once `cache` was enabled.
- **CommonJS:** `require("bsuir-iis-api")` works (the `exports` map now has a `default` condition); it failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Errors:** new common base class `BsuirError`. A non-numeric `current-week` body (e.g. an HTML maintenance page) is a `BsuirResponseValidationError` with `endpoint` (was `BsuirValidationError`, the caller-input error). Malformed pagination and the 50-page cap are `BsuirResponseValidationError` (was `BsuirConfigurationError`). Invalid `Date` arguments to schedule helpers throw `BsuirValidationError` (was `TypeError`). `BsuirApiError.retryAfterMs` exposes a server `Retry-After` hint.
- **Study week:** a `currentWeek` anchor applies within its academic year only. A late-August anchor used to carry the count into September (week 3 instead of week 1).
- **Runtime support:** `Promise.withResolvers` and Iterator helpers are gone from the runtime code. On older Safari they failed only on retries or with the cache enabled, with a raw `TypeError`. `src` is now type-checked against an ES2023 baseline, and browser tests also run in WebKit.
- **`baseUrl`:** explicit ports are accepted for allowlisted hosts (proxies on `:8443`), and `allowInsecureHttp` works for any allowlisted host (`http://bsuir-proxy:8080` in docker-compose); the public IIS host always requires HTTPS. A response redirected outside `allowedBaseUrlHosts`, or downgraded to HTTP, fails with `BsuirConfigurationError` instead of being trusted.
- `onRetry` no longer fires when a too-large `Retry-After` prevents a retry (the `"retry_after_too_large"` reason is removed), so retry metrics are no longer over-counted.
- `formatLessonWeekNumbers` prints "кажд. нед." for `[1, 2, 3, 4]`, the way IIS encodes weekly lessons. `filterLessons({ lessonTypeAbbrev: [] })` no longer filters out every lesson.
- Removed unreachable internals: non-GET methods, request bodies and custom headers in the HTTP layer (the public API never exposed them).
