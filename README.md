# bsuir-iis-api

[![npm version](https://img.shields.io/npm/v/bsuir-iis-api)](https://www.npmjs.com/package/bsuir-iis-api)
[![CI](https://img.shields.io/github/actions/workflow/status/kotru21/bsuir-iis-api/ci.yml?branch=main&label=CI)](https://github.com/kotru21/bsuir-iis-api/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/bsuir-iis-api)](https://www.npmjs.com/package/bsuir-iis-api)
[![license](https://img.shields.io/npm/l/bsuir-iis-api)](./LICENSE)

Type-safe ESM SDK for [BSUIR IIS API](https://iis.bsuir.by/api/) with support for Node.js and browser runtimes. Example project exists in [this repo](https://github.com/kotru21/BsuirRasp).

## Runtime requirements

- **Node.js** `>=22.18` as declared in `package.json` (`engines`). CI runs the full pipeline (lint, typecheck, tests, build) on Node 22, 24 (active LTS), and 26 (current, early-warning).
- A global **`fetch`** implementation, or pass `fetch` into `createBsuirClient({ fetch })` (for tests or polyfills).
- **`AbortController` / `AbortSignal`** for cancellation and timeouts. When `AbortSignal.any` is available (current Node and modern browsers), the client combines the per-request timeout with your `signal` using the platform API; otherwise it merges them manually with `setTimeout`, so timeouts still apply together with a caller-provided `AbortSignal`.
- **`Promise.withResolvers`** and **`Iterator` helpers** (e.g. `.toArray()`) — required by the HTTP pipeline; present in Node 22.18+ and current evergreen browsers.

## Install

```bash
npm install bsuir-iis-api
```

## Quick start

Default schedule calls return a **normalized** payload. That shape includes `lessons`, `lessonsByDay`, `scheduleLessons`, and `examLessons` (see types). Use explicit raw helpers such as `client.schedule.getGroupRaw()` / `getEmployeeRaw()` to obtain the API’s raw `ScheduleResponse` (which has `schedules` / `exams` and may omit `lessons`).

```ts
import { createBsuirClient } from "bsuir-iis-api";

// Default: structural envelope guards only. For deep lesson/item field checks
// (so runtime matches the TypeScript DTOs), prefer createBsuirClient.strict().
const client = createBsuirClient();

const schedule = await client.schedule.getGroup("053503");
// Normalized: `lessons` = weekly + exams flattened; see `scheduleLessons` / `examLessons` to split.
console.log(schedule.lessons.length);
```

## Client options

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient({
  baseUrl: "https://iis.bsuir.by/api/v1",
  allowedBaseUrlHosts: ["iis.bsuir.by"],
  allowInsecureHttp: false,
  timeoutMs: 10000,
  retries: 2,
  retryDelayMs: 300,
  retryMaxDelayMs: 3000,
  retryJitter: true,
  cache: { ttlMs: 60_000, maxEntries: 200 },
  dedupeInFlight: true,
  maxResponseBytes: 5_000_000,
  validateResponses: true,
  hooks: {
    onRetry: ({ endpoint, delayMs, reason }) => {
      console.log("retry", endpoint, delayMs, reason);
    }
  }
});
```

- `fetch` can be passed for custom runtime/testing.
- `baseUrl` is normalized and validated (absolute URL, no credentials/query/hash, host allowlist). Explicit ports are rejected for public hosts but allowed on loopback (`localhost`, `127.0.0.1`, `[::1]`) so local dev/mock servers stay usable.
- `allowedBaseUrlHosts` controls which hosts are allowed for `baseUrl` (defaults to `["iis.bsuir.by"]`).
- `allowInsecureHttp` enables `http://` only for trusted local/test endpoints.
- `signal` in `createBsuirClient({ signal })` acts as a global cancellation signal for all requests made by that client.
- `cache` stores successful GET responses in-memory for the configured TTL. A live `AbortSignal` can still use cache; an already-aborted signal skips cache. Cache hits return **deep-frozen** JSON (same reference on repeat reads); clone the payload if you need to mutate it. Use a separate client instance per identity in multi-tenant apps.
- `cache.store` plugs in a custom storage backend (any synchronous Map-compatible object: a shared `Map`, an `lru-cache` instance, a custom adapter). The SDK still handles TTL and LRU eviction itself — the store is a plain container. A store can be shared across client instances; `keys()`/`entries()` must iterate in insertion order for LRU eviction to be accurate.

```ts
const store = new Map(); // or: new LRUCache<string, ResponseCacheEntry>({ max: 500 })
const clientA = createBsuirClient({ cache: { ttlMs: 60_000, store } });
const clientB = createBsuirClient({ cache: { ttlMs: 60_000, store } }); // shares entries with clientA
```

- `dedupeInFlight` reuses the same in-flight GET request for concurrent callers. It is disabled for per-request signals, non-default cache modes, private credential headers, and already-aborted signals.
- `maxResponseBytes` limits body size per response to protect against memory spikes.
- Response checking is two-tier:
  - **Always on (structural):** catalog/announcement unwraps must resolve to arrays; schedule day buckets must be arrays (or nullish → empty); `schedules` / `nextSchedules` must be maps (object|null|absent); and `exams` must be array|null|absent. These guards apply to **normalized and raw** schedule fetches (`getGroup` / `getGroupRaw` / employee equivalents) and throw `BsuirResponseValidationError` even when `validateResponses` is `false`, so the SDK can honor return types and avoid silent empty schedules or raw `TypeError`s on malformed IIS payloads.
  - **Opt-in (`validateResponses: true`, default `false`):** deep payload-shape checks — schedule responses down to every lesson item (`schedules` / `nextSchedules` / `exams`), announcements down to each item (fields checked when present; IIS may omit keys on sparse payloads), and catalog items as objects. Prefer enabling in development/tests; use `createBsuirClient.strict(options?)` as a shorthand that forces `validateResponses: true` without changing the default for `createBsuirClient()`.
- Cache hits re-run any configured `responseValidator` (including when `validateResponses` is enabled), so a shared or hand-populated `cache.store` cannot bypass validation for the current client.
- `hooks` provides lifecycle callbacks (`onRequest`, `onRetry`, `onResponse`, `onError`) for observability. Hook exceptions are caught and discarded — an observability callback never breaks the request, triggers a retry, or masks the real outcome.
- `AbortSignal` is supported by all read methods.

## API

### Schedule

- `client.schedule.getGroup(groupNumber, options?)`
- `client.schedule.getEmployee(urlId, options?)`
- `client.schedule.getGroupRaw(groupNumber, options?)`
- `client.schedule.getEmployeeRaw(urlId, options?)`
- `client.schedule.getGroupFiltered(groupNumber, filter, options?)`
- `client.schedule.getEmployeeFiltered(urlId, filter, options?)`
- `client.schedule.getGroupExams(groupNumber, options?)`
- `client.schedule.getEmployeeExams(urlId, options?)`
- `client.schedule.getGroupBySubgroup(groupNumber, subgroup, options?)` — flattened lessons
- `client.schedule.getGroupBySubgroupRaw(groupNumber, subgroup, options?)` — `ScheduleItem[]`
- `client.schedule.getGroupBySubgroupEnvelope(groupNumber, subgroup, options?)` — filtered `ScheduleResponse`
- `client.schedule.getEmployeeBySubgroup(urlId, subgroup, options?)` — flattened lessons
- `client.schedule.getEmployeeBySubgroupRaw(urlId, subgroup, options?)` — `ScheduleItem[]`
- `client.schedule.getEmployeeBySubgroupEnvelope(urlId, subgroup, options?)` — filtered `ScheduleResponse`
- `client.schedule.getCurrentWeek(options?)`

### Catalogs

- `client.groups.listAll(options?)` / `client.groups.listAllPages(options?)`
- `client.employees.listAll(options?)` / `client.employees.listAllPages(options?)`
- `client.faculties.listAll(options?)` / `client.faculties.listAllPages(options?)`
- `client.departments.listAll(options?)` / `client.departments.listAllPages(options?)`
- `client.specialities.listAll(options?)` / `client.specialities.listAllPages(options?)`
- `client.auditories.listAll(options?)` / `client.auditories.listAllPages(options?)`

Catalog list methods always resolve to arrays. If IIS returns a Spring Data page envelope (`{ content: [...] }`):

- **`listAll()`** unwraps **first page only** (does not request page 2+). Prefer this when catalogs are small or returned as a plain array. Do **not** assume it returns the full catalog — if IIS paginates, use `listAllPages()`.
- **`listAllPages()`** fetches **all pages** (query `page` / `size`) and concatenates them. If IIS reports more than **50** pages, the SDK throws `BsuirConfigurationError` (same safety cap as announcements).

### Announcements

- `client.announcements.byEmployee(urlId, options?)`
- `client.announcements.byDepartment(id, options?)`

Both methods always resolve to `Announcement[]`. IIS may respond with a plain JSON array (legacy) or a Spring Data page envelope (`{ content: [...], pageable, totalElements, ... }`); the SDK unwraps `content` automatically so callers do not need to handle the envelope.

When IIS responds with HTTP `404` (the employee or department has no announcements), these methods resolve to an empty array `[]` instead of throwing `BsuirApiError`. Pass `treat404AsEmpty: false` to receive the underlying `BsuirApiError` instead. Client-side validation still runs first (`urlId`, department `id`); all other HTTP errors (including `400`) are always thrown so malformed-request bugs are not silently masked.

**Pagination note:** IIS serves announcements as Spring Data pages (default `size` 20) using `page` / `size` query params. The SDK fetches **all pages** and returns the concatenated `Announcement[]`. If IIS reports more than **50** pages, the SDK throws `BsuirConfigurationError` (safety cap). Catalog **`listAll()`** still unwraps the first page only; use **`listAllPages()`** to fetch every catalog page under the same 50-page cap.

### Public exports (runtime utilities and types)

- Core runtime API: `createBsuirClient`, `BsuirClient`
- Client/runtime option types: `BsuirClientOptions`, `CacheOptions`, `CacheStore`, `ResponseCacheEntry`, `ClientHooks`, `RequestCacheMode`, `ReadOptions`, `AnnouncementReadOptions`, `AnnouncementsModule`, `ListModule`, `ScheduleModule`, `ScheduleReadOptions`, `RequestHookContext`, `RetryHookContext`, `ResponseHookContext`, `ErrorHookContext`
- Schedule utilities: `normalizeSchedule`, `filterLessons`, `getLessonsForDate`, `getTodayLessons`, `getTomorrowLessons`, `getLessonsForWeek`, `sortLessonsByTime`, `groupLessonsByDay`, `getCurrentLesson`, `getNextLesson`, `buildScheduleDays`, `ScheduleFilterOptions`, `NormalizeScheduleOptions`, `InvalidLessonTimeHook`
- Formatters: `formatEmployeeShortName`, `formatLessonAuditories`, `formatLessonEmployees`, `formatLessonSubgroup`, `formatLessonTimeRange`, `formatLessonType`, `formatLessonWeekNumbers`
- Error classes: `BsuirApiError`, `BsuirNetworkError`, `BsuirTimeoutError`, `BsuirValidationError`, `BsuirResponseValidationError`, `BsuirResponsePayloadTooLargeError`, `BsuirConfigurationError`
- Domain types: `Announcement`, `Auditory`, `AuditoryDepartment`, `AuditoryType`, `BuildingNumber`, `Department`, `EducationForm`, `Employee`, `EmployeeCatalogItem`, `Faculty`, `FlattenedLessonsByDay`, `FlattenedScheduleItem`, `FlattenedScheduleSource`, `LessonStudentGroup`, `Maybe`, `NormalizedScheduleResponse`, `ScheduleItem`, `ScheduleResponse`, `Speciality`, `StudentGroupCatalogItem`, `StudentGroupShort`, `Weekday`, `WeekScheduleMap`

## Errors

SDK throws typed errors:

- `BsuirApiError` for HTTP errors (contains `status`, `endpoint`, `body`). Non-2xx plain-text bodies are preserved even when IIS mislabels them as JSON. **Exception:** `client.announcements.byEmployee` / `byDepartment` resolve to `[]` on IIS HTTP `404` (unless `treat404AsEmpty: false`) instead of throwing (see Announcements above).
- `BsuirResponsePayloadTooLargeError` when response body size exceeds configured `maxResponseBytes`.
- `BsuirNetworkError` for transport errors (contains `endpoint` and standard `cause`)
- `BsuirResponseValidationError` for invalid payload shapes: always-on structural guards (non-array catalog/announcement unwraps, non-array schedule day buckets, non-map `schedules`/`nextSchedules`, non-array `exams`), and deep item/field checks when `validateResponses: true`
- `BsuirTimeoutError` for timeouts (contains `endpoint`, `timeoutMs`)
- `BsuirValidationError` for invalid input parameters
- `BsuirConfigurationError` when the runtime has no `fetch` and none was passed to `createBsuirClient({ fetch })`, or when announcements / catalog `listAllPages` pagination exceeds the 50-page safety cap

Validation rules:

- `groupNumber` must contain digits only
- `urlId` must be a slug with letters/digits/hyphens (for example `s-nesterenkov`)
- `id` and `subgroup` parameters must be positive integers; subgroup filters also include shared lessons (`numSubgroup === 0`)

Retry and abort behavior:

- Retries are applied to GET requests for transport/network errors and HTTP `429`, `500`, `502`, `503`, `504`
- `Retry-After` is respected for retriable responses: the server's hint is honored in full up to a 60s safety ceiling, independently of `retryMaxDelayMs` (which caps only the SDK's own exponential backoff). A `Retry-After` beyond 60s disables the retry (`onRetry` fires with `reason: "retry_after_too_large"`).
- Caller-provided aborted `AbortSignal` is re-thrown as native `AbortError`; aborting during a retry wait stops the wait immediately instead of stalling until the delay elapses.
- Internal timeout (`timeoutMs`) aborts the attempt and throws `BsuirTimeoutError` immediately — timeouts are **not** retried (retries stay limited to network errors and HTTP 429/5xx)

`createBsuirClient()` throws `BsuirConfigurationError` if no `fetch` implementation is available.

## Successful HTTP responses (body parsing)

For **2xx** responses the client reads the body as text, then applies `JSON.parse` when the payload is valid JSON:

- Valid JSON is returned even when `Content-Type` does **not** include `application/json` (mislabeled responses still parse).
- If `Content-Type` indicates JSON (`application/json` or a `+json` media type, ignoring parameters) but the body is empty or not valid JSON, the client throws `BsuirApiError` (`Invalid JSON response payload`), same as for a truncated `{` payload.
- If the body is **empty** and the content type does **not** indicate JSON, the result is `null`. Typical IIS catalog JSON endpoints return a non-empty body.
- If response body size exceeds `maxResponseBytes`, the client throws `BsuirResponsePayloadTooLargeError`.

## Error HTTP responses (body parsing)

For **non-2xx** responses the client still attempts `JSON.parse`, but does **not** discard useful plain-text bodies when the server mislabels them as JSON (IIS seasonal/maintenance messages often do this with HTTP `503`):

- Valid JSON error payloads are attached to `BsuirApiError.body` as parsed objects.
- If `JSON.parse` fails, the raw response text is preserved in `BsuirApiError.body` and appended to `message`.
- Empty bodies yield `body: null` with the standard HTTP status message.

## Raw vs normalized schedule response

By default, schedule methods return a **normalized** `NormalizedScheduleResponse`: `lessons` is all flattened items (weekly + exams), each tagged with `source: "schedules" | "exams"`; `scheduleLessons` / `examLessons` are the same rows split by source; `lessonsByDay` groups by weekday.

**Normalized payloads are deep-frozen.** Every view (`lessons`, `lessonsByDay`, `scheduleLessons`, `examLessons`, `schedules`, `exams`) and all nested objects share one immutable structure — mutating any part of it throws `TypeError` in strict mode. Clone a lesson explicitly if you need a mutable copy. The raw `ScheduleResponse` you pass to `normalizeSchedule()` is never mutated or frozen (normalization works on an owned deep clone).

**Current term only by default.** IIS may also send `nextSchedules` (next academic term). Normalization and `getGroup` / `getEmployee` **ignore** that map unless you opt in:

```ts
import { createBsuirClient, normalizeSchedule } from "bsuir-iis-api";

const client = createBsuirClient();
const withNext = await client.schedule.getGroup("053503", { includeNextSchedules: true });
// or: normalizeSchedule(raw, { includeNextSchedules: true })
// Next-term rows appear in `lessons` / `lessonsByDay` with `source: "nextSchedules"`.
```

Raw helpers (`getGroupRaw` / `getEmployeeRaw`) always preserve `nextSchedules` when present (and still apply always-on structural envelope checks).

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();
const raw = await client.schedule.getGroupRaw("053503");
```

Use explicit helpers `getGroupRaw` / `getEmployeeRaw` to obtain raw envelopes. `getGroup()` / `getEmployee()` return normalized payloads by default. For subgroup filtering use `get*BySubgroup` (flattened), `get*BySubgroupRaw`, or `get*BySubgroupEnvelope`.
`get*BySubgroupEnvelope` filters `schedules` by subgroup; with `includeNextSchedules: true` it also filters `nextSchedules`, otherwise it omits `nextSchedules` (current-term only — same default as flattened helpers).
In raw mode API may return `schedules: null`; normalized mode always converts it to `{}`.
In raw mode some lesson fields may also be nullable (`weekNumber`, `lessonTypeAbbrev`), so keep null checks if you consume raw payload directly.
README examples match the installed package version; if types and docs ever diverge, rely on `NormalizedScheduleResponse` / `ScheduleResponse` from the same release.

## Current week

`client.schedule.getCurrentWeek()` returns the current week value directly from IIS API.
The SDK normalizes `current-week` payloads, including plain-text responses like `1\n`.

Filtering example:

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();
const exams = await client.schedule.getGroupFiltered("053503", {
  source: "exams",
  lessonTypeAbbrev: ["Консультация", "Экзамен"]
});
```

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();
const subgroupLessons = await client.schedule.getEmployeeBySubgroup("s-nesterenkov", 1);
```

## Schedule helpers for UI

```ts
import { buildScheduleDays, getTodayLessons } from "bsuir-iis-api";

const todayLessons = getTodayLessons(schedule, new Date());
const days = buildScheduleDays(schedule, { days: 7, includeEmptyDays: false });
```

Use `getCurrentLesson(days[0].lessons)` / `getNextLesson(days[0].lessons)` for in-day progress indicators.

## Development

```bash
npm install
npm run lint
npm run lint:fix
npm run check
npm run build
npm run api:report
```

`npm run build` uses [tsdown](https://tsdown.dev/) so `.d.ts` / API Extractor output stay aligned with the published ESM bundle. TypeScript’s handbook notes that [`paths` can be used without `baseUrl`](https://www.typescriptlang.org/docs/handbook/modules/reference.html) when you need path mapping.

Linting uses ESLint flat config with strict type-aware TypeScript rules for `src`,
plus test-specific overrides for `test` and `vitest.config.ts`.

Live contract tests against real BSUIR API are opt-in (`test/integration/live/`):

```bash
BSUIR_LIVE_TESTS=1 npm run test:live
```

PowerShell:

```powershell
$env:BSUIR_LIVE_TESTS="1"; npm run test:live
```

GitHub Actions runs live contracts weekly (Mondays 06:00 UTC) and on demand via the
**Live contract** workflow (`workflow_dispatch`). Catalogs and announcements must pass;
schedule / strict / helpers soft-skip with a warning when IIS probes find no working entities.

## Release checklist

1. Run `npm run check:full`.
2. Add or update a `.changeset/*.md` entry for user-visible changes.
3. Run `npx changeset version` to bump `package.json`, update `CHANGELOG.md`, and consume changesets.
4. Run `npm run api:report:check` and `npm run release:dry`.
5. Push to `main` to trigger GitHub Actions release workflow.
6. Verify published package in a clean project:

```bash
mkdir bsuir-iis-smoke && cd bsuir-iis-smoke
npm init -y
npm install bsuir-iis-api@latest
node -e "import('bsuir-iis-api').then(m=>console.log(typeof m.createBsuirClient))"
```

The project uses Changesets for version bumps and changelog generation; edit pending changeset text before versioning when release notes need refinement.

## Migration notes (majors)

When this package ships a **major** changeset, include a short note with:

1. **Removed / renamed** — what callers must change
2. **Mapping table** — old call → new call
3. **Search hints** — strings to find in consuming repos

### 2.1.0 — structural hardening

Compatible minor for most apps; watch these tightenings if you relied on lenient parsing:

- **Raw schedule envelopes:** `schedules` / `nextSchedules` must be object maps (or null/absent), not arrays; `exams` must be array|null|absent. Failures throw `BsuirResponseValidationError` even with `validateResponses: false`.
- **Subgroup envelopes:** `get*BySubgroupEnvelope` omits `nextSchedules` unless you pass `{ includeNextSchedules: true }`.
- **Catalogs:** `listAll()` remains first-page-only; use `listAllPages()` for full catalogs.

Search hints: `getGroupRaw`, `getGroupBySubgroupEnvelope`, `includeNextSchedules`, `.listAll(`.

### 2.0.0 — Node.js floor, last-update removal, subgroup shared lessons

**Removed / renamed**

- `client.schedule.getLastUpdateByGroup()` / `client.schedule.getLastUpdateByEmployee()` — removed; the upstream `/last-update-date/*` routes are legacy and unmaintained on the IIS side.
- `ApiDateResponse` type — removed.
- Low-level HTTP types removed from the public surface: `RequestOptions`, `QueryParams`, `QueryValue`, `RequestMethod` (still used internally; hook contexts keep their field shapes).
- Runtime floor raised: **Node.js >=22.18** (Node 20 is EOL).

**Behavior change**

- Subgroup filters (`filterLessons` / `get*Filtered` / `get*BySubgroup*`) treat `numSubgroup === 0` as **shared** lessons included for every positive subgroup. Filtering with `subgroup: 0` remains invalid.

**Mapping**

| Before (1.x)                                                      | After (2.0)                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `schedule.getLastUpdateByGroup(...)`                              | no SDK replacement — use your own cache TTL / re-fetch policy |
| `schedule.getLastUpdateByEmployee(...)`                           | same                                                          |
| `ApiDateResponse`                                                 | no replacement needed                                         |
| `RequestOptions` / `QueryParams` / `QueryValue` / `RequestMethod` | not exported — use `ReadOptions` / hook context types         |
| subgroup filter exact `numSubgroup` match                         | also includes shared lessons (`numSubgroup === 0`)            |

**Search hints** for consuming repos: `getLastUpdateBy`, `ApiDateResponse`, `last-update-date`, `RequestOptions`, `QueryParams`, `RequestMethod`.

### 1.0.0 — subgroup schedule helpers

| Before                                               | After                                 |
| ---------------------------------------------------- | ------------------------------------- |
| `getGroupBySubgroup(g, s, { raw: true })`            | `getGroupBySubgroupRaw(g, s)`         |
| `getGroupBySubgroup(g, s, { rawEnvelope: true })`    | `getGroupBySubgroupEnvelope(g, s)`    |
| `getEmployeeBySubgroup(u, s, { raw: true })`         | `getEmployeeBySubgroupRaw(u, s)`      |
| `getEmployeeBySubgroup(u, s, { rawEnvelope: true })` | `getEmployeeBySubgroupEnvelope(u, s)` |
| `getGroupEnvelope(g, s)`                             | `getGroupBySubgroupEnvelope(g, s)`    |
| `getEmployeeEnvelope(u, s)`                          | `getEmployeeBySubgroupEnvelope(u, s)` |

Default `get*BySubgroup(...)` (flattened lessons) is unchanged. Flags `raw` / `rawEnvelope` on subgroup methods are removed.

Search hints: `rawEnvelope`, `getGroupEnvelope`, `getEmployeeEnvelope`, `getGroupBySubgroup(.*raw`.

## License

MIT
