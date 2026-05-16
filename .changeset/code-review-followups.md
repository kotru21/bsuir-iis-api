---
"bsuir-iis-api": minor
---

Code review follow-ups across HTTP client, cache, schedule modules, and helpers.

- normalizeSchedule clones each lesson once instead of re-cloning during flattening.
- Response cache stores deep-frozen JSON values; reads return the frozen reference instead of cloning on every hit. setCache now rejects non-JSON values with `BsuirConfigurationError`.
- `requestJson` no longer disables caching/dedup when a non-aborted `AbortSignal` is passed — only an already-aborted signal disables them.
- Query keys are sorted deterministically in `buildUrl` for stable cache keys.
- Relaxed query key validation: any non-control, non-whitespace, non-URL-structural character is allowed.
- Private-header detection switched from substring sniffing to an explicit denylist.
- Request body now passes through `BodyInit` shapes (`FormData`/`URLSearchParams`/`Blob`/`ArrayBuffer`/`ReadableStream`) instead of being JSON-stringified.
- `Retry-After` numeric branch now applies the same internal cap as the date branch.
- `allowInsecureHttp: true` rejects any non-loopback host in `allowedBaseUrlHosts`.
- `mergeSignalsManual` cleanup is idempotent and listeners are recorded before registration to avoid leaks.
- `normalizeSchedule` always performs a minimal envelope check; full validation delegates to the single `assertScheduleResponse` source of truth.
- `schedule.getGroupBySubgroup` and `schedule.getEmployeeBySubgroup` accept `rawEnvelope: true` for envelope-preserving raw output (existing `raw` and default behaviors unchanged).
- `announcements.byEmployee` / `byDepartment` accept `treat404AsEmpty` (default `true`) instead of relying on a body-marker heuristic to detect "no announcements" 404 responses.
- Added optional `onInvalidTime` hook to `sortLessonsByTime` / `getCurrentLesson` / `getNextLesson` / `buildScheduleDays` for surfacing malformed `HH:MM` lesson times.
- Added third `createBsuirClient` overload to support callers passing a `defaultRaw: boolean` of unknown polarity; `BsuirClient` is now an explicit union.
