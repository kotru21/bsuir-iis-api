---
"bsuir-iis-api": minor
---

**Hardening: always-on structural response guards** (independent of `validateResponses`). Catalog/announcement unwraps must resolve to arrays, and schedule day buckets (`schedules` / `nextSchedules`) must be arrays (nullish → empty); failures throw `BsuirResponseValidationError` instead of a raw `TypeError`. Deep item/field checks remain opt-in via `validateResponses` / `createBsuirClient.strict()`.

**Cache hits re-validate.** When a `responseValidator` is configured (including `validateResponses: true`), cached payloads are validated again so a shared or hand-populated `cache.store` cannot bypass checks.

**Subgroup helpers honor `includeNextSchedules`.** `get*BySubgroup*` (normalized/raw/envelope) accept `ScheduleReadOptions` and include matching `nextSchedules` lessons when opted in.

**Pagination safety.** Multi-page fetches throw `BsuirConfigurationError` if Spring `pageNumber` does not advance, the page cap is exceeded, or a follow-up page has non-array `content`.

**Loopback allowlist.** `allowInsecureHttp` / loopback host checks treat only true `127.0.0.0/8` IPv4 addresses as loopback (not hostname prefixes like `127.evil.com`).

**Public types.** Export `AnnouncementsModule` and `ListModule` for typed client module shapes (`ScheduleModule` was already public).
