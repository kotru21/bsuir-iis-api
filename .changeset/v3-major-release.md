---
"bsuir-iis-api": major
---

3.0: one schedule entry point, full catalogs, types that match live IIS data, frozen results everywhere, and fixes for browsers, caching and hooks. The README "Migration notes → 3.0.0" section has the full list, mapping tables and search hints.

**Breaking API changes**

- **`schedule.get(target, options?)` / `schedule.getRaw(target, options?)` replace 14 methods** (`getGroup`, `getEmployee`, `get*Raw`, `get*Filtered`, `get*Exams`, `get*BySubgroup`, `get*BySubgroupRaw`, `get*BySubgroupEnvelope`). `target` is `{ group }` or `{ employee }`. The `filter` option (any `ScheduleFilterOptions`, also on `normalizeSchedule`) narrows **every** view of the result, so `get(target, { filter: { subgroup: 2 } })` is a complete subgroup schedule that `buildScheduleDays` accepts directly. `getCurrentWeek()` is unchanged; `ScheduleTarget` is exported.
- **`listAll()` returns the whole catalog.** When IIS answers with a Spring page envelope, every page is fetched (50-page cap); it used to return the first page only. `listAllPages()` is removed. Plain-array responses (what IIS sends today) behave as before.
- **`announcements.byDepartment(urlId)`** takes the department slug (`Department.urlId`, e.g. `"kaf-vmip"`, a new field). IIS answers the numeric `id` the SDK used to send with HTTP 400, so the method never returned data; a number now fails fast with `BsuirValidationError`.
- **Every client result is deep-frozen, whatever the options**, and DTO/result types are `readonly`. Previously only cached or deduplicated payloads were frozen, so `(await client.groups.listAll()).sort()` worked without a cache and threw `TypeError` once `cache` was enabled.
- **Nullable fields found on live IIS payloads:** `ScheduleItem.subject` / `subjectFullName` (`string | null`) and `auditories` (`readonly string[] | null`) on IIS announcement rows; `Employee.middleName`, `EmployeeCatalogItem.middleName` / `rank`, `StudentGroupCatalogItem.course`, `Auditory.note` / `department`. Normalized lessons still always have an `auditories` array.
- **Errors:** new common base class `BsuirError`. A bad `current-week` body, malformed or over-cap pagination, and a 2xx body labelled JSON that is empty or invalid are `BsuirResponseValidationError` (were `BsuirValidationError`, `BsuirConfigurationError` and `BsuirApiError` with `status: 200`); `BsuirApiError` now always means a non-2xx response. Invalid `Date` arguments to helpers throw `BsuirValidationError` (was `TypeError`). `BsuirApiError.retryAfterMs` exposes a server `Retry-After` hint, and `onRetry` no longer fires when a too-large `Retry-After` prevents the retry (reason `"retry_after_too_large"` removed).
- `BsuirClientShape` is removed: `BsuirClient` is the client interface.

**Fixes**

- **Browsers and Cloudflare Workers work again.** `fetch` was called with the SDK's config object as `this`, which native `fetch` rejects (`TypeError: Illegal invocation`), so every request failed as `BsuirNetworkError`. Browser tests now run the real `fetch` in Chromium and WebKit.
- **Strict mode accepts real IIS data and checks all of it.** It rejected whole schedules containing IIS announcement rows (`subject: null`, `auditories: null`) and employees with an apostrophe in `urlId` (`a-kuz'mich`). Every DTO field — catalog items, nested lesson employees / student groups, `employeeDto` / `studentGroupDto` — is now validated from one schema per DTO that the compiler binds to the exported interface. Lessons under a day key other than the six BSUIR weekdays are rejected in strict mode and kept in `normalized.schedules` otherwise.
- **Broken bodies never stick in the cache.** Every endpoint validates the body before the cache write and on cache hits, and evicts a cached entry that fails, so a 2xx maintenance page no longer fails every call until the TTL expires. The always-on schedule checks also reject lesson rows that are not objects (they crashed normalization with a raw `TypeError`).
- **Hooks:** every call ends with exactly one `onResponse` or `onError`, and `onResponse` fires only after validation passed. `dedupeInFlight` works with per-call signals: a caller that aborts stops waiting without cancelling the request for the others; `ResponseHookContext` / `ErrorHookContext` gain `deduplicated`.
- **Current/next lesson ignore all-day IIS announcement rows** (`01:00–23:00`) when a regular lesson qualifies; `filterLessons({ subjectQuery })` no longer matches the text "null" on such rows.
- **Study week:** a `currentWeek` anchor applies within its academic year only (a late-August anchor carried the count into September). `filterLessons({ weekNumber })` / `getLessonsForWeek` include every-week rows (`weekNumber` null or empty). `formatLessonWeekNumbers` prints "кажд. нед." for `[1, 2, 3, 4]`; `filterLessons({ lessonTypeAbbrev: [] })` no longer filters out everything.
- **`buildScheduleDays({ onInvalidTime })`** reports malformed times for every day of the range, once per lesson and field.
- **CommonJS:** `require("bsuir-iis-api")` works (the `exports` map has a `default` condition).
- **Runtime baseline:** `Promise.withResolvers` and Iterator helpers are gone from runtime code (they failed on older Safari on retry/cache paths); `src` is type-checked against ES2023.
- **`baseUrl`:** explicit ports are accepted and `allowInsecureHttp` works for any allowlisted host (the public IIS host always requires HTTPS); a response redirected outside `allowedBaseUrlHosts`, or downgraded to HTTP, fails with `BsuirConfigurationError`.
- `formatEmployeeShortName` no longer returns a leading space when the last name is empty. Unreachable HTTP-layer internals (non-GET methods, bodies, custom headers) are removed.
