---
"bsuir-iis-api": major
---

Pre-release fixes found against live IIS (November 2026). See "3.0.0" in the README migration notes.

- **`announcements.byDepartment(urlId)` works again.** IIS reads the department slug from `url-id` (`?url-id=kaf-vmip`); the SDK sent `?id=<number>`, which IIS answers with HTTP 400 on every call, so the method never returned data. It now takes `Department.urlId` (a new field on `Department`, validated in strict mode). Passing a number fails fast with `BsuirValidationError`.
- **Strict mode accepts `auditories: null`.** IIS announcement rows without a room carry it (e.g. group 450504), and `createBsuirClient.strict()` rejected the whole schedule. `ScheduleItem.auditories` is `readonly string[] | null`; normalized lessons (`FlattenedScheduleItem`) still always have an array.
- **Current/next lesson ignore all-day announcement rows.** `getCurrentLesson` / `getNextLesson` (and `buildScheduleDays`) prefer regular lessons; an IIS announcement row spanning `01:00–23:00` used to be the "current lesson" for the whole day.
- **Broken catalog/announcement bodies are no longer cached.** With `cache` enabled and strict mode off, a 2xx HTML page from a catalog or announcements endpoint was cached and every call failed until the TTL expired. The always-on list check now runs before the cache write and on cache hits.
- **One terminal hook per call.** `onResponse` fires only after the payload passed validation; a rejected body fires `onError` alone (it used to fire `onResponse` and then `onError`, or only `onResponse` for a non-array catalog body). A cache hit rejected by validation reports `attempt: 1`.
