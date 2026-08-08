---
"bsuir-iis-api": minor
---

**Hardening: always-on structural response guards** (independent of `validateResponses`). Catalog/announcement unwraps must resolve to arrays; schedule day buckets must be arrays (nullish → empty); `schedules` / `nextSchedules` must be maps (object|null|absent); and `exams` must be array|null|absent. These checks apply to **normalized and raw** schedule fetches. Failures throw `BsuirResponseValidationError` instead of a raw `TypeError` or a silent empty schedule / dropped exams. Deep item/field checks remain opt-in via `validateResponses` / `createBsuirClient.strict()`.

**Cache hits re-validate.** When a `responseValidator` is configured (including `validateResponses: true` and always-on structural validators on schedule fetches), cached payloads are validated again so a shared or hand-populated `cache.store` cannot bypass checks.

**Subgroup helpers honor `includeNextSchedules`.** `get*BySubgroup*` (normalized/raw/envelope) accept `ScheduleReadOptions` and include matching `nextSchedules` lessons when opted in. Envelope helpers strip `nextSchedules` when the flag is off (current-term only) and filter them by subgroup when on.

**Timeout cleanup on `AbortSignal.any`.** Request timeout timers are clearable after success via the same `getMergedSignalCleanup` WeakMap path used by the manual merge fallback (no lingering `AbortSignal.timeout` timers).

**Pagination safety.** Multi-page fetches throw `BsuirConfigurationError` if Spring `pageNumber` does not advance, the page cap is exceeded, or a follow-up page has non-array `content`. When both `last` and `totalPages` are absent, a full page of `content` is treated as “maybe more” (Spring heuristic) so the first page is not silently truncated.

**Timeouts are not retried.** `timeoutMs` aborts the attempt and throws `BsuirTimeoutError` immediately; retries remain limited to network errors and HTTP 429/5xx (docs/types aligned with behavior).

**Null-safe schedule formatters and time helpers.** Time/auditories/name helpers tolerate nullish sparse fields with stable empty-string output instead of raw `TypeError`. `sortLessonsByTime` / `getCurrentLesson` / `getNextLesson` treat non-string or empty times as missing (no crash, no `onInvalidTime` for nullish).

**Content-Type JSON detection.** Response parsing treats the media type as JSON when it is `application/json` or ends with `+json` (parameters after `;` ignored), so `application/json; charset=utf-8` and `application/vnd.api+json` are handled consistently.

**`onInvalidTime` once per helper call.** `getCurrentLesson` / `getNextLesson` report malformed times during sort only and do not re-fire the hook when re-parsing the sorted list.

**Loopback allowlist.** `allowInsecureHttp` / loopback host checks treat only true `127.0.0.0/8` IPv4 addresses as loopback (not hostname prefixes like `127.evil.com`).

**Public types.** Export `AnnouncementsModule` and `ListModule` for typed client module shapes (`ScheduleModule` was already public).

**Consumer-facing tightenings (raw / subgroup).** Raw schedule fetches reject array-shaped `schedules` / `nextSchedules` and non-array `exams` even when `validateResponses` is off. `get*BySubgroupEnvelope` strips `nextSchedules` when `includeNextSchedules` is off (pass `{ includeNextSchedules: true }` to keep next-term rows).
