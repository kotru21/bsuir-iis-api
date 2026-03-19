# bsuir-iis-api

Type-safe ESM SDK for [BSUIR IIS API](https://iis.bsuir.by/api/) with support for Node.js and browser runtimes. Example project exist in [this repo](https://github.com/kotru21/BsuirRasp).

## Install

```bash
npm install bsuir-iis-api
```

## Quick start

Default schedule calls return a **normalized** payload (`defaultRaw: false`). That shape includes `lessons`, `lessonsByDay`, `scheduleLessons`, and `examLessons` (see types). With `{ raw: true }` you get the API’s raw `ScheduleResponse` instead—no `lessons` field; use `schedules` / `exams` and match examples to the option you use.

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();

const schedule = await client.schedule.getGroup("053503");
// Normalized: `lessons` = weekly + exams flattened; see `scheduleLessons` / `examLessons` to split.
console.log(schedule.lessons.length);
```

## Client options

```ts
const client = createBsuirClient({
  baseUrl: "https://iis.bsuir.by/api/v1",
  timeoutMs: 10000,
  retries: 2,
  retryDelayMs: 300,
  retryMaxDelayMs: 3000,
  retryJitter: true,
  defaultRaw: false
});
```

- `fetch` can be passed for custom runtime/testing.
- `AbortSignal` is supported by all read methods.

## API

### Schedule

- `client.schedule.getGroup(groupNumber, options?)`
- `client.schedule.getEmployee(urlId, options?)`
- `client.schedule.getGroupFiltered(groupNumber, filter, options?)`
- `client.schedule.getEmployeeFiltered(urlId, filter, options?)`
- `client.schedule.getGroupExams(groupNumber, options?)`
- `client.schedule.getEmployeeExams(urlId, options?)`
- `client.schedule.getGroupBySubgroup(groupNumber, subgroup, options?)`
- `client.schedule.getEmployeeBySubgroup(urlId, subgroup, options?)`
- `client.schedule.getCurrentWeek(options?)`
- `client.schedule.getLastUpdateByGroup({ groupNumber } | { id }, options?)`
- `client.schedule.getLastUpdateByEmployee({ urlId } | { id }, options?)`

### Catalogs

- `client.groups.listAll(options?)`
- `client.employees.listAll(options?)`
- `client.faculties.listAll(options?)`
- `client.departments.listAll(options?)`
- `client.specialities.listAll(options?)`
- `client.auditories.listAll(options?)`

### Announcements

- `client.announcements.byEmployee(urlId, options?)`
- `client.announcements.byDepartment(id, options?)`

## Errors

SDK throws typed errors:

- `BsuirApiError` for HTTP errors (contains `status`, `endpoint`, `body`)
- `BsuirNetworkError` for transport errors (contains `endpoint`, `causeError`, and standard `cause`)
- `BsuirTimeoutError` for timeouts (contains `endpoint`, `timeoutMs`)
- `BsuirValidationError` for invalid input parameters

Validation rules:

- `groupNumber` must contain digits only
- `urlId` must be a slug with letters/digits/hyphens (for example `s-nesterenkov`)
- `id` and `subgroup` parameters must be positive integers
Retry and abort behavior:

- Retries are applied to `429`, `500`, `502`, `503`, `504`
- `Retry-After` is respected for retriable responses
- Caller-provided aborted `AbortSignal` is re-thrown as native `AbortError`
- Internal timeout is mapped to `BsuirTimeoutError`

`createBsuirClient()` throws regular `Error` if no `fetch` implementation is available.

## Raw vs normalized schedule response

By default, schedule methods return a **normalized** `NormalizedScheduleResponse`: `lessons` is all flattened items (weekly + exams), each tagged with `source: "schedules" | "exams"`; `scheduleLessons` / `examLessons` are the same rows split by source; `lessonsByDay` groups by weekday.

```ts
const raw = await client.schedule.getGroup("053503", { raw: true });
```

Use `defaultRaw: true` in `createBsuirClient` to change global behavior.
When `raw` is omitted, `getGroup()` and `getEmployee()` return normalized payload.
In raw mode API may return `schedules: null`; normalized mode always converts it to `{}`.
In raw mode some lesson fields may also be nullable (`weekNumber`, `lessonTypeAbbrev`), so keep null checks if you consume raw payload directly.
README examples match the installed package version; if types and docs ever diverge, rely on `NormalizedScheduleResponse` / `ScheduleResponse` from the same release.

## Current week

`client.schedule.getCurrentWeek()` returns the current week value directly from IIS API.
The SDK normalizes `current-week` payloads, including plain-text responses like `1\n`.

Filtering example:

```ts
const exams = await client.schedule.getGroupFiltered("053503", {
  source: "exams",
  lessonTypeAbbrev: ["Консультация", "Экзамен"]
});
```

```ts
const subgroupLessons = await client.schedule.getEmployeeBySubgroup("s-nesterenkov", 1);
```

## Development

```bash
npm install
npm run lint
npm run lint:fix
npm run check
npm run build
```

Linting uses ESLint flat config with strict type-aware TypeScript rules for `src`,
plus test-specific overrides for `test` and `vitest.config.ts`.

Live contract tests against real BSUIR API are opt-in:

```bash
BSUIR_LIVE_TESTS=1 npm run test:live
```

PowerShell:

```powershell
$env:BSUIR_LIVE_TESTS="1"; npm run test:live
```

CI has a manual `workflow_dispatch` path that also runs live contracts (`live-contract` job).

## Release checklist

1. Run `npm run check:full`.
2. Update version and `CHANGELOG.md` in the same release commit.
3. Push to `main` to trigger GitHub Actions release workflow.
4. Verify published package in a clean project:

```bash
mkdir bsuir-iis-smoke && cd bsuir-iis-smoke
npm init -y
npm install bsuir-iis-api@latest
node -e "import('bsuir-iis-api').then(m=>console.log(typeof m.createBsuirClient))"
```

The project keeps `CHANGELOG.md` manually curated for stable release notes.

## License

MIT
