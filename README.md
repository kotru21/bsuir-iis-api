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
- **Browsers:** an ES2023 runtime with `structuredClone` — Chrome/Edge 110+, Firefox 115+, Safari 16+. IIS sends CORS headers, so the client can call it directly from a page. `npm run typecheck` checks `src` against this baseline (`tsconfig.baseline.json`), and browser tests run in Chromium and WebKit.
- **ESM and CommonJS:** `import { createBsuirClient } from "bsuir-iis-api"` and `const { createBsuirClient } = require("bsuir-iis-api")` both work (CommonJS through Node's `require(esm)`).

## Install

```bash
npm install bsuir-iis-api
```

## Quick start

`client.schedule.get(target, options?)` returns a **normalized** payload: `lessons`, `lessonsByDay`, `scheduleLessons`, `examLessons` plus the cloned `schedules` / `exams` maps. `target` is `{ group: "053503" }` or `{ employee: "s-nesterenkov" }`. `client.schedule.getRaw(target)` returns the API’s raw `ScheduleResponse`.

```ts
import { createBsuirClient } from "bsuir-iis-api";

// Default: structural envelope guards only. For deep lesson/item field checks
// (so runtime matches the TypeScript DTOs), prefer createBsuirClient.strict().
const client = createBsuirClient();

const schedule = await client.schedule.get({ group: "053503" });
// Normalized: `lessons` = weekly + exams flattened; see `scheduleLessons` / `examLessons` to split.
console.log(schedule.lessons.length);

// The same schedule narrowed to one subgroup (shared lessons included) — every view,
// so it can go straight into buildScheduleDays().
const mine = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 2 } });
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

- `fetch` can be passed for custom runtime/testing (proxy agents, tracing, mocks). The SDK always calls it without a receiver, so a native method such as `window.fetch` can be passed as-is.
- `baseUrl` is normalized and validated (absolute URL, no credentials/query/hash, host allowlist). Any explicit port is accepted (a proxy on `:8443`, a mock server on `:3000`).
- `allowedBaseUrlHosts` controls which hosts are allowed for `baseUrl` (defaults to `["iis.bsuir.by"]`). `fetch` follows redirects by itself, so the SDK also checks where a response ended up: a redirect to a host outside the list (or an HTTPS → HTTP downgrade) fails with `BsuirConfigurationError`.
- `allowInsecureHttp` enables `http://` for hosts you list in `allowedBaseUrlHosts` — a local mock server or a proxy on a private network such as `http://bsuir-proxy:8080` in docker-compose. The public IIS host always requires HTTPS.
- `signal` in `createBsuirClient({ signal })` acts as a global cancellation signal for all requests made by that client.
- `cache` stores successful GET responses in-memory for the configured TTL. A live `AbortSignal` can still use cache; an already-aborted signal skips cache. Cache hits return the same frozen reference on repeat reads. IIS read endpoints are public and the SDK sends no per-user headers, so one client (and one cache) can serve many users.
- `cache.store` plugs in a custom storage backend (any synchronous Map-compatible object: a shared `Map`, an `lru-cache` instance, a custom adapter). The SDK still handles TTL and LRU eviction itself — the store is a plain container. A store can be shared across client instances; `keys()`/`entries()` must iterate oldest-first (insertion order) for LRU eviction to be accurate. `lru-cache` iterates newest-first, so let it own capacity: keep its `max` at or below `cache.maxEntries`.

```ts
const store = new Map();
const clientA = createBsuirClient({ cache: { ttlMs: 60_000, store } });
const clientB = createBsuirClient({ cache: { ttlMs: 60_000, store } }); // shares entries with clientA

// lru-cache: its own `max` does the eviction; SDK maxEntries must not be smaller.
const lru = new LRUCache<string, ResponseCacheEntry>({ max: 500 });
const clientC = createBsuirClient({ cache: { ttlMs: 60_000, maxEntries: 500, store: lru } });
```

- `dedupeInFlight` reuses the same in-flight GET request for concurrent callers, including callers with their own `signal` (e.g. one `AbortController` per React effect): a caller whose signal aborts stops waiting and rejects with its own abort reason, while the shared request carries on for the others and is cancelled only once every waiting caller has aborted. It is not used for non-default cache modes or already-aborted signals.
- **Every result is deep-frozen, whatever the options.** Catalogs, announcements, raw and normalized schedules, subgroup and filtered lists are all frozen, and their types are `readonly`, so TypeScript flags in-place mutation (`list.sort()`, `lesson.note = …`). Copy first: `list.toSorted(...)`, `[...list]`, `structuredClone(lesson)`. Before 3.0 only cached/deduplicated payloads were frozen, so code that sorted a catalog in place worked without a cache and threw `TypeError` once caching was enabled.
- `maxResponseBytes` limits body size per response to protect against memory spikes.
- Response checking is two-tier:
  - **Always on (structural):** catalog/announcement unwraps must resolve to arrays; schedule day buckets must be arrays (or nullish → empty); `schedules` / `nextSchedules` must be maps (object|null|absent); and `exams` must be array|null|absent. These guards apply to **normalized and raw** schedule fetches (`schedule.get` / `schedule.getRaw`) and throw `BsuirResponseValidationError` even when `validateResponses` is `false`, so the SDK can honor return types and avoid silent empty schedules or raw `TypeError`s on malformed IIS payloads.
  - **Opt-in (`validateResponses: true`, default `false`):** deep payload-shape checks — schedule responses down to every lesson item (`schedules` / `nextSchedules` / `exams`), announcements down to each item (fields checked when present; IIS may omit keys on sparse payloads), and catalog items field by field. These checks come from one schema per DTO, compile-time bound to the exported interfaces, so strict mode validates exactly what the types promise. Prefer enabling in development/tests; use `createBsuirClient.strict(options?)` as a shorthand that forces `validateResponses: true` without changing the default for `createBsuirClient()`.
- Cache hits re-run any configured `responseValidator` (including when `validateResponses` is enabled), so a shared or hand-populated `cache.store` cannot bypass validation for the current client. An entry that fails is evicted, so the next call goes back to the network. Bodies that fail the always-on checks (e.g. a maintenance page from `current-week`) are never cached.
- `hooks` provides lifecycle callbacks (`onRequest`, `onRetry`, `onResponse`, `onError`) for observability. Hook exceptions are caught and discarded — an observability callback never breaks the request, triggers a retry, or masks the real outcome. Every call ends with exactly one `onResponse` or `onError`; with `dedupeInFlight`, callers that joined another caller's request get them with `deduplicated: true` (and no `onRequest` / `onRetry`), so `deduplicated: false` events count network requests.
- `AbortSignal` is supported by all read methods.

## API

### Schedule

- `client.schedule.get(target, options?)` — normalized `NormalizedScheduleResponse`
  - `target`: `{ group: "053503" }` or `{ employee: "s-nesterenkov" }`
  - `options.includeNextSchedules`: next-term rows (see below)
  - `options.filter`: any `ScheduleFilterOptions` (`subgroup`, `source`, `weekday`, `weekNumber`, `lessonTypeAbbrev`, `subjectQuery`, `employeeUrlId`, `auditory`); narrows **every** view of the result
  - plus `signal` / `cache` like every read method
- `client.schedule.getRaw(target, options?)` — raw IIS `ScheduleResponse`
- `client.schedule.getCurrentWeek(options?)`

```ts
const exams = (await client.schedule.get({ group: "053503" })).examLessons;
const lectures = await client.schedule.get(
  { employee: "s-nesterenkov" },
  { filter: { lessonTypeAbbrev: "ЛК" } }
);
const subgroup1 = await client.schedule.get({ group: "053503" }, { filter: { subgroup: 1 } });
```

### Catalogs

- `client.groups.listAll(options?)` / `client.groups.listAllPages(options?)`
- `client.employees.listAll(options?)` / `client.employees.listAllPages(options?)`
- `client.faculties.listAll(options?)` / `client.faculties.listAllPages(options?)`
- `client.departments.listAll(options?)` / `client.departments.listAllPages(options?)`
- `client.specialities.listAll(options?)` / `client.specialities.listAllPages(options?)`
- `client.auditories.listAll(options?)` / `client.auditories.listAllPages(options?)`

Catalog list methods always resolve to arrays. If IIS returns a Spring Data page envelope (`{ content: [...] }`):

- **`listAll()`** unwraps **first page only** (does not request page 2+). Prefer this when catalogs are small or returned as a plain array. Do **not** assume it returns the full catalog — if IIS paginates, use `listAllPages()`.
- **`listAllPages()`** fetches **all pages** (query `page` / `size`) and concatenates them. If IIS reports more than **50** pages, the SDK throws `BsuirResponseValidationError` (same safety cap as announcements).

### Announcements

- `client.announcements.byEmployee(urlId, options?)`
- `client.announcements.byDepartment(urlId, options?)` — `urlId` is the department slug (`Department.urlId` from `client.departments.listAll()`, e.g. `"kaf-vmip"`), not the numeric `id`

Both methods always resolve to `Announcement[]`. IIS may respond with a plain JSON array (legacy) or a Spring Data page envelope (`{ content: [...], pageable, totalElements, ... }`); the SDK unwraps `content` automatically so callers do not need to handle the envelope.

When IIS responds with HTTP `404` (the employee or department has no announcements), these methods resolve to an empty array `[]` instead of throwing `BsuirApiError`. Pass `treat404AsEmpty: false` to receive the underlying `BsuirApiError` instead. Client-side validation still runs first (employee and department `urlId`); all other HTTP errors (including `400`) are always thrown so malformed-request bugs are not silently masked.

**Pagination note:** IIS serves announcements as Spring Data pages (default `size` 20) using `page` / `size` query params. The SDK fetches **all pages** and returns the concatenated `Announcement[]`. If IIS reports more than **50** pages, or a page is malformed, the SDK throws `BsuirResponseValidationError` (safety cap). Catalog **`listAll()`** still unwraps the first page only; use **`listAllPages()`** to fetch every catalog page under the same 50-page cap.

### Public exports (runtime utilities and types)

- Core runtime API: `createBsuirClient`, `BsuirClient`
- Client/runtime option types: `BsuirClientOptions`, `CacheOptions`, `CacheStore`, `ResponseCacheEntry`, `ClientHooks`, `RequestCacheMode`, `ReadOptions`, `AnnouncementReadOptions`, `AnnouncementsModule`, `ListModule`, `ScheduleModule`, `ScheduleReadOptions`, `RequestHookContext`, `RetryHookContext`, `ResponseHookContext`, `ErrorHookContext`
- Schedule utilities: `normalizeSchedule`, `filterLessons`, `getLessonsForDate`, `getTodayLessons`, `getTomorrowLessons`, `getLessonsForWeek`, `sortLessonsByTime`, `groupLessonsByDay`, `getCurrentLesson`, `getNextLesson`, `buildScheduleDays`, `getStudyWeek`, `BSUIR_TIME_ZONE`, `ScheduleFilterOptions`, `NormalizeScheduleOptions`, `StudyWeekOptions`, `ScheduleTimeZoneOptions`, `LessonTimeOptions`, `InvalidLessonTimeHook`
- Formatters: `formatEmployeeShortName`, `formatLessonAuditories`, `formatLessonEmployees`, `formatLessonSubgroup`, `formatLessonTimeRange`, `formatLessonType`, `formatLessonWeekNumbers`
- Error classes: `BsuirError` (common base), `BsuirApiError`, `BsuirNetworkError`, `BsuirTimeoutError`, `BsuirValidationError`, `BsuirResponseValidationError`, `BsuirResponsePayloadTooLargeError`, `BsuirConfigurationError`
- Domain types: `Announcement`, `Auditory`, `AuditoryDepartment`, `AuditoryType`, `BuildingNumber`, `Department`, `EducationForm`, `Employee`, `EmployeeCatalogItem`, `Faculty`, `FlattenedLessonsByDay`, `FlattenedScheduleItem`, `FlattenedScheduleSource`, `LessonStudentGroup`, `Maybe`, `NormalizedScheduleResponse`, `ScheduleItem`, `ScheduleResponse`, `Speciality`, `StudentGroupCatalogItem`, `StudentGroupShort`, `Weekday`, `WeekScheduleMap`

## Errors

SDK throws typed errors. All of them extend `BsuirError`, so `error instanceof BsuirError` separates SDK failures from bugs in your own code (a caller's own `AbortSignal` reason is re-thrown as-is):

- `BsuirApiError` for HTTP errors (contains `status`, `endpoint`, `body`, and `retryAfterMs` when the response carried a valid `Retry-After`). Non-2xx plain-text bodies are preserved even when IIS mislabels them as JSON. **Exception:** `client.announcements.byEmployee` / `byDepartment` resolve to `[]` on IIS HTTP `404` (unless `treat404AsEmpty: false`) instead of throwing (see Announcements above).
- `BsuirResponsePayloadTooLargeError` when response body size exceeds configured `maxResponseBytes`.
- `BsuirNetworkError` for transport errors (contains `endpoint` and standard `cause`)
- `BsuirResponseValidationError` for invalid payload shapes: always-on structural guards (non-array catalog/announcement unwraps, non-array schedule day buckets, non-map `schedules`/`nextSchedules`, non-array `exams`, a `current-week` body that is not a positive integer, malformed Spring pages or more than 50 pages, a 2xx body labelled as JSON that is empty or not valid JSON — `Invalid JSON response payload…`, not retried), and deep item/field checks when `validateResponses: true` (including lessons under a day key other than the six BSUIR weekdays, which normalization cannot place into `lessons` / `lessonsByDay`)
- `BsuirTimeoutError` for timeouts (contains `endpoint`, `timeoutMs`)
- `BsuirValidationError` for invalid input parameters (including non-`Date` / invalid `Date` arguments of schedule helpers)
- `BsuirConfigurationError` for client misconfiguration: no `fetch` available, invalid option values, a disallowed `baseUrl`, or a response redirected outside `allowedBaseUrlHosts`

Validation rules:

- `groupNumber` must contain digits only
- `urlId` must be a slug with letters/digits separated by hyphens or apostrophes (for example `s-nesterenkov`, `a-kuz'mich` — IIS transliterates the soft sign as an apostrophe)
- `id` and `subgroup` parameters must be positive integers; subgroup filters also include shared lessons (`numSubgroup === 0`)

Retry and abort behavior:

- Retries are applied to GET requests for transport/network errors and HTTP `429`, `500`, `502`, `503`, `504`
- `Retry-After` is respected for retriable responses: the server's hint is honored in full up to a 60s safety ceiling, independently of `retryMaxDelayMs` (which caps only the SDK's own exponential backoff). A `Retry-After` beyond 60s disables the retry: `onRetry` does **not** fire, and the hint is available as `BsuirApiError.retryAfterMs`.
- A caller's own `AbortSignal` reason is re-thrown as-is (a plain `abort()` gives the native `AbortError` `DOMException`); aborting during a retry wait stops the wait immediately instead of stalling until the delay elapses.
- Internal timeout (`timeoutMs`) aborts the attempt and throws `BsuirTimeoutError` immediately — timeouts are **not** retried (retries stay limited to network errors and HTTP 429/5xx)

`createBsuirClient()` throws `BsuirConfigurationError` if no `fetch` implementation is available.

## Successful HTTP responses (body parsing)

For **2xx** responses the client reads the body as text, then applies `JSON.parse` when the payload is valid JSON:

- Valid JSON is returned even when `Content-Type` does **not** include `application/json` (mislabeled responses still parse).
- If `Content-Type` indicates JSON (`application/json` or a `+json` media type, ignoring parameters) but the body is empty or not valid JSON, the client throws `BsuirResponseValidationError` (`Invalid JSON response payload…`), same as for a truncated `{` payload. It is not retried: the request itself succeeded.
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

**Current term only by default.** IIS may also send `nextSchedules` (next academic term). Normalization and `schedule.get` ignore that map while current-term `schedules` has lessons. If `schedules` is empty (typical between terms), `nextSchedules` is flattened automatically so `lessons` is not silently empty. Pass `{ includeNextSchedules: true }` to always include next-term rows, or `false` to keep current-term only:

```ts
import { createBsuirClient, normalizeSchedule } from "bsuir-iis-api";

const client = createBsuirClient();
const withNext = await client.schedule.get({ group: "053503" }, { includeNextSchedules: true });
// or: normalizeSchedule(raw, { includeNextSchedules: true })
// Next-term rows appear in `lessons` / `lessonsByDay` with `source: "nextSchedules"`.
```

`schedule.getRaw` always preserves `nextSchedules` when present (and still applies always-on structural envelope checks).

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();
const raw = await client.schedule.getRaw({ group: "053503" });
```

**Filtering.** `get(target, { filter })` (or `normalizeSchedule(raw, { filter })`) narrows `lessons`, `lessonsByDay`, `scheduleLessons`, `examLessons` and the `schedules` / `exams` / `nextSchedules` maps alike, so a filtered result is a complete schedule — and still a valid `ScheduleResponse` envelope. Subgroup filters keep shared lessons (`numSubgroup === 0`). The `includeNextSchedules` fallback is decided on the unfiltered timetable: filtering one subgroup out of a populated term never pulls in next-term rows. `filterLessons(schedule, filter)` remains for filtering just the flat `lessons` list of an existing result.
In raw mode API may return `schedules: null`; normalized mode always converts it to `{}`.
In raw mode some lesson fields may also be nullable (`weekNumber`, `lessonTypeAbbrev`), so keep null checks if you consume raw payload directly.
IIS also puts **announcement rows** into the timetable (`announcement: true`, e.g. `note: "Последняя лекция в семестре"` with a `dateLesson`): their `subject`, `subjectFullName` and `lessonTypeAbbrev` are `null` in both raw and normalized payloads, and strict mode accepts them.
README examples match the installed package version; if types and docs ever diverge, rely on `NormalizedScheduleResponse` / `ScheduleResponse` from the same release.

## Current week

`client.schedule.getCurrentWeek()` returns the current week value directly from IIS API.
The SDK normalizes `current-week` payloads, including plain-text responses like `1\n`.

Filtering example:

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();
const { lessons: consultationsAndExams } = await client.schedule.get(
  { group: "053503" },
  { filter: { source: "exams", lessonTypeAbbrev: ["Консультация", "Экзамен"] } }
);
```

## Schedule helpers for UI

```ts
import { buildScheduleDays, getStudyWeek, getTodayLessons } from "bsuir-iis-api";

const todayLessons = getTodayLessons(schedule, new Date());
const days = buildScheduleDays(schedule, { days: 7, includeEmptyDays: false });
const week = getStudyWeek(); // 1..4, no network call
```

Use `getCurrentLesson(days[0].lessons)` / `getNextLesson(days[0].lessons)` for in-day progress indicators. Each `ScheduleDay` also carries the `weekNumber` used to pick its lessons.

**Time zone.** Date helpers read `Date` instants as **Minsk** calendar dates and wall-clock times (`timeZone: "Europe/Minsk"` by default), because IIS lesson times are Minsk times. This keeps "today" and the current lesson correct on servers running in UTC. Pass `timeZone` to override, e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone` for the runtime's local zone. `ScheduleDay.date` is the start of that day in the chosen zone; use `dateKey` (`"YYYY-MM-DD"`) for zone-independent comparisons.

**Study week.** Weekly lessons are matched by BSUIR study week (1–4). By default it comes from the academic calendar: week 1 is the Monday–Sunday week containing 1 September, weeks change on Mondays, and the cycle runs through the whole academic year. For the authoritative value, pass `currentWeek` from the API — other dates are counted from it:

```ts
const [schedule, currentWeek] = await Promise.all([
  client.schedule.get({ group: "053503" }),
  client.schedule.getCurrentWeek()
]);
const days = buildScheduleDays(schedule, { days: 14, currentWeek });
const tomorrow = getTomorrowLessons(schedule, new Date(), { currentWeek });
```

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

### 3.0.0 — one schedule entry point, honest types, consistent immutability, error classes

**Schedule API.** The 14 per-subject/per-shape methods are replaced by `schedule.get(target, options?)` (normalized) and `schedule.getRaw(target, options?)` (IIS envelope); `getCurrentWeek()` is unchanged. `target` is `{ group }` or `{ employee }`; `options.filter` takes any `ScheduleFilterOptions` and narrows every view of the result.

| Before (2.x)                                      | After (3.0)                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `schedule.getGroup(g, opts)`                      | `schedule.get({ group: g }, opts)`                                                                                   |
| `schedule.getEmployee(u, opts)`                   | `schedule.get({ employee: u }, opts)`                                                                                |
| `schedule.getGroupRaw(g)` / `getEmployeeRaw(u)`   | `schedule.getRaw({ group: g })` / `schedule.getRaw({ employee: u })`                                                 |
| `schedule.getGroupFiltered(g, filter, opts)`      | `(await schedule.get({ group: g }, { ...opts, filter })).lessons`                                                    |
| `schedule.getGroupExams(g)`                       | `(await schedule.get({ group: g })).examLessons`                                                                     |
| `schedule.getGroupBySubgroup(g, n, opts)`         | `(await schedule.get({ group: g }, { ...opts, filter: { subgroup: n } })).lessons` without `source === "exams"` rows |
| `schedule.getGroupBySubgroupRaw(g, n, opts)`      | same as above (`FlattenedScheduleItem` extends `ScheduleItem`)                                                       |
| `schedule.getGroupBySubgroupEnvelope(g, n, opts)` | `await schedule.get({ group: g }, { ...opts, filter: { subgroup: n } })` — also a `ScheduleResponse`                 |
| `getEmployee*(u, …)`                              | the same with `{ employee: u }`                                                                                      |

Differences from the subgroup envelope: exams are filtered by subgroup too, and `nextSchedules` is kept (narrowed by the filter) instead of being stripped. A filtered result can be passed to `buildScheduleDays` and the other date helpers directly.

Search hints: `getGroup`, `getEmployee`, `BySubgroup`, `Filtered(`, `Exams(`.

**Behavior changes**

- **Nullable DTO fields, as found on live IIS payloads (November 2026):** `Employee.middleName` and `EmployeeCatalogItem.middleName` (employees without a patronymic), `EmployeeCatalogItem.rank` (null for ~2/3 of employees), `StudentGroupCatalogItem.course`, `Auditory.note` and `Auditory.department` are now `… | null`.
- **Strict mode checks every DTO field** — catalog items, nested lesson `employees` / `studentGroups`, `employeeDto` / `studentGroupDto` — from one schema per DTO, compile-time bound to the exported interface (a field added to a type without its validator, or vice versa, no longer compiles). Previously catalog items were only checked to be objects and nested DTOs not at all.
- **Employees with an apostrophe in `urlId`** (`a-kuz'mich`, `e-mel'nikova`, … — 5 on live IIS) are accepted; the SDK used to reject them with `BsuirValidationError`, so their schedules and announcements were unreachable.

- **Every client result is deep-frozen**, with or without `cache` / `dedupeInFlight`. Previously only cached/deduplicated payloads were frozen, so in-place mutation worked in development and threw `TypeError` once caching was on.
- **DTO and result types are `readonly`** (`readonly T[]` lists, `readonly` fields), matching the frozen runtime data.
- `ScheduleItem.subject` / `subjectFullName` are `string | null`: IIS sends `null` on announcement rows. `createBsuirClient.strict()` used to reject the whole schedule of such groups.
- `ScheduleItem.auditories` is `readonly string[] | null`: announcement rows without a room carry `auditories: null` (strict mode rejected those schedules). Normalized lessons (`FlattenedScheduleItem`, and the `schedules` / `exams` maps of `schedule.get`) still always have an array.
- **`announcements.byDepartment(urlId)`** takes the department slug (`Department.urlId`, e.g. `"kaf-vmip"`; the field is new on `Department`). The numeric `id` it took in 2.x is rejected by IIS with HTTP 400 on every call; a number now fails fast with `BsuirValidationError`.
- **`getCurrentLesson` / `getNextLesson`** (and `buildScheduleDays`' `currentLesson` / `nextLesson`) prefer regular lessons over IIS announcement rows, which can span `01:00–23:00` and used to be reported as the current lesson all day.
- **Error classes:** every SDK error extends the new `BsuirError`. `getCurrentWeek()` reports a bad body as `BsuirResponseValidationError` (was `BsuirValidationError`). Malformed or over-cap pagination is `BsuirResponseValidationError` (was `BsuirConfigurationError`). Invalid `Date` arguments to helpers throw `BsuirValidationError` (was `TypeError`).
- **`currentWeek` anchor** applies within its academic year only: dates from 1 September onwards restart at week 1.
- **`baseUrl`:** explicit ports are accepted for any allowlisted host; `allowInsecureHttp` works for any allowlisted host except `iis.bsuir.by`; redirects outside `allowedBaseUrlHosts` are rejected.
- `onRetry` no longer fires when a too-large `Retry-After` prevents the retry (reason `"retry_after_too_large"` removed); read `BsuirApiError.retryAfterMs` instead.
- `formatLessonWeekNumbers` prints `"кажд. нед."` for `[1, 2, 3, 4]`. `filterLessons` treats `lessonTypeAbbrev: []` as "no filter".
- **Browsers:** requests no longer fail with `BsuirNetworkError` (cause `TypeError: Illegal invocation`). The SDK used to call `fetch` with its config object as `this`, which native browser and Cloudflare Workers `fetch` reject — with the default global `fetch` and with `window.fetch` passed explicitly.
- **2xx body labelled JSON that does not parse** (or is empty) throws `BsuirResponseValidationError` (was `BsuirApiError` with `status: 200`). `BsuirApiError` now always means a non-2xx response.
- **`filterLessons({ weekNumber })` / `getLessonsForWeek`** include weekly rows whose `weekNumber` is `null` or empty — they run every week, as `getLessonsForDate` and `formatLessonWeekNumbers` already treated them. Exams and `dateLesson` rows still match only an explicit list.
- **`dedupeInFlight` works with per-call signals** (see Client options) instead of being silently disabled. `ResponseHookContext` / `ErrorHookContext` gain `deduplicated: boolean`; joined callers now get their own `onResponse` / `onError`.
- **Strict mode** (`validateResponses` / `createBsuirClient.strict()` / `normalizeSchedule(…, { validate: true })`) rejects lessons under a day key other than the six BSUIR weekdays (e.g. `"Воскресенье"`). Without strict mode such buckets are kept in `normalized.schedules` instead of being dropped (they are still not part of `lessons` / `lessonsByDay`).
- **`buildScheduleDays({ onInvalidTime })`** reports malformed times for every day of the range, once per lesson and field. It used to report only today's lessons, twice.
- **Cache:** a cached entry that fails validation is evicted, and a body that fails the always-on checks (a 2xx maintenance page from any endpoint — schedules, `current-week`, catalogs, announcements) is no longer cached.
- **Hooks:** `onResponse` fires only after the response (or cache hit) passed validation, so a rejected body ends with `onError` alone. It used to fire `onResponse` followed by `onError` (and only `onResponse` for a non-array catalog body).
- `formatEmployeeShortName` returns `"И.И."` (no leading space) when the last name is empty.

**Mapping**

| Before (2.x)                                                    | After (3.0)                                         |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `(await client.groups.listAll()).sort(cmp)`                     | `(await client.groups.listAll()).toSorted(cmp)`     |
| `lesson.subject.toUpperCase()`                                  | `lesson.subject?.toUpperCase()`                     |
| `catch (e) { if (e instanceof BsuirValidationError) }` on week  | `e instanceof BsuirResponseValidationError`         |
| `e instanceof BsuirConfigurationError` on pagination cap        | `e instanceof BsuirResponseValidationError`         |
| `e instanceof TypeError` on helper `Date` args                  | `e instanceof BsuirValidationError`                 |
| `onRetry` with `reason === "retry_after_too_large"`             | `onError` + `(error as BsuirApiError).retryAfterMs` |
| function params typed `FlattenedScheduleItem[]` for SDK results | `readonly FlattenedScheduleItem[]`                  |
| `e instanceof BsuirApiError && e.status === 200` (broken JSON)  | `e instanceof BsuirResponseValidationError`         |
| relying on `filterLessons({ weekNumber })` to drop `null` weeks | filter `lesson.weekNumber?.includes(n)` yourself    |

Search hints: `.sort(`, `.push(`, `.subject.`, `retry_after_too_large`, `BsuirConfigurationError`, `TypeError`, `Invalid JSON`, `status === 200`, `weekNumber:`, `ResponseHookContext`, `ErrorHookContext`.

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
