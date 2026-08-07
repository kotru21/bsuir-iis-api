# bsuir-iis-api

[![npm version](https://img.shields.io/npm/v/bsuir-iis-api)](https://www.npmjs.com/package/bsuir-iis-api)
[![CI](https://img.shields.io/github/actions/workflow/status/kotru21/bsuir-iis-api/ci.yml?branch=main&label=CI)](https://github.com/kotru21/bsuir-iis-api/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/bsuir-iis-api)](https://www.npmjs.com/package/bsuir-iis-api)
[![license](https://img.shields.io/npm/l/bsuir-iis-api)](./LICENSE)

Type-safe ESM SDK for [BSUIR IIS API](https://iis.bsuir.by/api/) with support for Node.js and browser runtimes. Example project exists in [this repo](https://github.com/kotru21/BsuirRasp).

## Runtime requirements

- **Node.js** `>=20` as declared in `package.json` (`engines`). CI runs runtime checks on Node 20, 22, and 24; lint runs on Node 22+ (`eslint-plugin-unicorn` / `eslint-plugin-jsdoc` require it).
- A global **`fetch`** implementation, or pass `fetch` into `createBsuirClient({ fetch })` (for tests or polyfills).
- **`AbortController` / `AbortSignal`** for cancellation and timeouts. When `AbortSignal.any` is available (current Node and modern browsers), the client combines the per-request timeout with your `signal` using the platform API; otherwise it merges them manually with `setTimeout`, so timeouts still apply together with a caller-provided `AbortSignal`.

## Install

```bash
npm install bsuir-iis-api
```

## Quick start

Default schedule calls return a **normalized** payload. That shape includes `lessons`, `lessonsByDay`, `scheduleLessons`, and `examLessons` (see types). Use explicit raw helpers such as `client.schedule.getGroupRaw()` / `getEmployeeRaw()` to obtain the API’s raw `ScheduleResponse` (which has `schedules` / `exams` and may omit `lessons`).

```ts
import { createBsuirClient } from "bsuir-iis-api";

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
- `dedupeInFlight` reuses the same in-flight GET request for concurrent callers. It is disabled for per-request signals, non-default cache modes, private credential headers, and already-aborted signals.
- `maxResponseBytes` limits body size per response to protect against memory spikes.
- `validateResponses` enables runtime payload-shape checks for list, schedule, announcement, and last-update endpoints when set to `true` (default: `false`). Schedule responses are validated down to every lesson item (`schedules` / `nextSchedules` / `exams`) and announcements down to each item — fields are checked when present, since IIS may omit keys on sparse payloads; catalog items are checked as objects. Normalized schedule calls still apply a minimal envelope check so normalization cannot crash on non-objects. Prefer enabling in development/tests; use `createBsuirClient.strict(options?)` as a shorthand that forces `validateResponses: true` without changing the default for `createBsuirClient()`.
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
- `client.schedule.getLastUpdateByGroup({ groupNumber } | { id }, options?)` — **deprecated**
- `client.schedule.getLastUpdateByEmployee({ urlId } | { id }, options?)` — **deprecated**

**Last update (legacy IIS, deprecated).** The upstream routes `/last-update-date/student-group` and `/last-update-date/employee` are legacy on the BSUIR IIS side and are no longer maintained. The SDK marks these helpers `@deprecated`; behavior is unchanged for now. Removal is planned for the **next major (2.0)**. Until then helpers remain callable but `@deprecated`. Prefer schedule date fields or your own cache TTL. For newer group identifiers (six-digit numbers such as `524404`), the student-group endpoint may respond with an error; do not rely on these calls for cache freshness or invalidation.

### Catalogs

- `client.groups.listAll(options?)` / `client.groups.listAllPages(options?)`
- `client.employees.listAll(options?)` / `client.employees.listAllPages(options?)`
- `client.faculties.listAll(options?)` / `client.faculties.listAllPages(options?)`
- `client.departments.listAll(options?)` / `client.departments.listAllPages(options?)`
- `client.specialities.listAll(options?)` / `client.specialities.listAllPages(options?)`
- `client.auditories.listAll(options?)` / `client.auditories.listAllPages(options?)`

Catalog list methods always resolve to arrays. If IIS returns a Spring Data page envelope (`{ content: [...] }`):

- **`listAll()`** unwraps **first page only** (does not request page 2+). Prefer this when catalogs are small or returned as a plain array.
- **`listAllPages()`** fetches **all pages** (query `page` / `size`) and concatenates them. If IIS reports more than **50** pages, the SDK throws `BsuirConfigurationError` (same safety cap as announcements).

### Announcements

- `client.announcements.byEmployee(urlId, options?)`
- `client.announcements.byDepartment(id, options?)`

Both methods always resolve to `Announcement[]`. IIS may respond with a plain JSON array (legacy) or a Spring Data page envelope (`{ content: [...], pageable, totalElements, ... }`); the SDK unwraps `content` automatically so callers do not need to handle the envelope.

When IIS responds with HTTP `404` (the employee or department has no announcements), these methods resolve to an empty array `[]` instead of throwing `BsuirApiError`. Pass `treat404AsEmpty: false` to receive the underlying `BsuirApiError` instead. Client-side validation still runs first (`urlId`, department `id`); all other HTTP errors (including `400`) are always thrown so malformed-request bugs are not silently masked.

**Pagination note:** IIS serves announcements as Spring Data pages (default `size` 20) using `page` / `size` query params. The SDK fetches **all pages** and returns the concatenated `Announcement[]`. If IIS reports more than **50** pages, the SDK throws `BsuirConfigurationError` (safety cap). Catalog **`listAll()`** still unwraps the first page only; use **`listAllPages()`** to fetch every catalog page under the same 50-page cap.

### Public exports (runtime utilities and types)

- Core runtime API: `createBsuirClient`, `BsuirClient`
- Client/runtime option types: `BsuirClientOptions`, `CacheOptions`, `ClientHooks`, `RequestOptions`, `ReadOptions`, `AnnouncementReadOptions`, `ScheduleReadOptions`, `RequestHookContext`, `RetryHookContext`, `ResponseHookContext`, `ErrorHookContext`
- Schedule utilities: `normalizeSchedule`, `filterLessons`, `getLessonsForDate`, `getTodayLessons`, `getTomorrowLessons`, `getLessonsForWeek`, `sortLessonsByTime`, `groupLessonsByDay`, `getCurrentLesson`, `getNextLesson`, `buildScheduleDays`, `ScheduleFilterOptions`, `NormalizeScheduleOptions`, `InvalidLessonTimeHook`
- Formatters: `formatEmployeeShortName`, `formatLessonAuditories`, `formatLessonEmployees`, `formatLessonSubgroup`, `formatLessonTimeRange`, `formatLessonType`, `formatLessonWeekNumbers`
- Error classes: `BsuirApiError`, `BsuirNetworkError`, `BsuirTimeoutError`, `BsuirValidationError`, `BsuirResponseValidationError`, `BsuirResponsePayloadTooLargeError`, `BsuirConfigurationError`
- Domain types: `Announcement`, `ApiDateResponse`, `Auditory`, `AuditoryDepartment`, `AuditoryType`, `BuildingNumber`, `Department`, `EducationForm`, `Employee`, `EmployeeCatalogItem`, `Faculty`, `FlattenedLessonsByDay`, `FlattenedScheduleItem`, `FlattenedScheduleSource`, `LessonStudentGroup`, `Maybe`, `NormalizedScheduleResponse`, `ScheduleItem`, `ScheduleResponse`, `Speciality`, `StudentGroupCatalogItem`, `StudentGroupShort`, `Weekday`, `WeekScheduleMap`

## Errors

SDK throws typed errors:

- `BsuirApiError` for HTTP errors (contains `status`, `endpoint`, `body`). Non-2xx plain-text bodies are preserved even when IIS mislabels them as JSON. **Exception:** `client.announcements.byEmployee` / `byDepartment` resolve to `[]` on IIS HTTP `404` (unless `treat404AsEmpty: false`) instead of throwing (see Announcements above).
- `BsuirResponsePayloadTooLargeError` when response body size exceeds configured `maxResponseBytes`.
- `BsuirNetworkError` for transport errors (contains `endpoint` and standard `cause`)
- `BsuirResponseValidationError` for invalid payload shapes when `validateResponses: true`
- `BsuirTimeoutError` for timeouts (contains `endpoint`, `timeoutMs`)
- `BsuirValidationError` for invalid input parameters
- `BsuirConfigurationError` when the runtime has no `fetch` and none was passed to `createBsuirClient({ fetch })`, or when announcements / catalog `listAllPages` pagination exceeds the 50-page safety cap

Validation rules:

- `groupNumber` must contain digits only
- `urlId` must be a slug with letters/digits/hyphens (for example `s-nesterenkov`)
- `id` and `subgroup` parameters must be positive integers
  Retry and abort behavior:

- Retries are applied to GET requests for transport/network errors and HTTP `429`, `500`, `502`, `503`, `504`
- `Retry-After` is respected for retriable responses: the server's hint is honored in full up to a 60s safety ceiling, independently of `retryMaxDelayMs` (which caps only the SDK's own exponential backoff). A `Retry-After` beyond 60s disables the retry (`onRetry` fires with `reason: "retry_after_too_large"`).
- Caller-provided aborted `AbortSignal` is re-thrown as native `AbortError`; aborting during a retry wait stops the wait immediately instead of stalling until the delay elapses.
- Internal timeout is mapped to `BsuirTimeoutError`

`createBsuirClient()` throws `BsuirConfigurationError` if no `fetch` implementation is available.

## Successful HTTP responses (body parsing)

For **2xx** responses the client reads the body as text, then applies `JSON.parse` when the payload is valid JSON:

- Valid JSON is returned even when `Content-Type` does **not** include `application/json` (mislabeled responses still parse).
- If `Content-Type` indicates **`application/json`** but the body is empty or not valid JSON, the client throws `BsuirApiError` (`Invalid JSON response payload`), same as for a truncated `{` payload.
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

Raw helpers (`getGroupRaw` / `getEmployeeRaw`) always preserve `nextSchedules` when present.

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();
const raw = await client.schedule.getGroupRaw("053503");
```

Use explicit helpers `getGroupRaw` / `getEmployeeRaw` to obtain raw envelopes. `getGroup()` / `getEmployee()` return normalized payloads by default. For subgroup filtering use `get*BySubgroup` (flattened), `get*BySubgroupRaw`, or `get*BySubgroupEnvelope`.
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

`npm run build` uses [tsup](https://tsup.egoist.dev/) with [`experimentalDts`](https://tsup.egoist.dev/) so `.d.ts` output is produced via `@microsoft/api-extractor` rather than the legacy Rollup declaration path (which is awkward with TypeScript 6’s `baseUrl` deprecation). TypeScript’s handbook notes that [`paths` can be used without `baseUrl`](https://www.typescriptlang.org/docs/handbook/modules/reference.html) when you need path mapping.

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

### Planned 2.0 (not released)

Intended breaking items (see local quality backlog): remove `schedule.getLastUpdateByGroup` / `getLastUpdateByEmployee`; change subgroup filter so `numSubgroup === 0` is treated as shared lessons; trim leaked low-level request types from the public surface. Exact mapping will land in this section when 2.0 ships.

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
