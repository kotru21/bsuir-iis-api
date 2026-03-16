# bsuir-iis-api

Type-safe ESM SDK for [BSUIR IIS API](https://iis.bsuir.by/api/) with support for Node.js and browser runtimes. Example project exist in [this repo](https://github.com/kotru21/BsuirRasp).

## Install

```bash
npm install bsuir-iis-api
```

## Quick start

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();

const schedule = await client.schedule.getGroup("053503");
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
- `client.schedule.getCurrentCycleWeek(options?)`
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

### Meta

- `client.currentWeek.get(options?)` (alias to `client.schedule.getCurrentWeek`)
- `client.currentWeek.getCycle(options?)` (alias to `client.schedule.getCurrentCycleWeek`)
- `client.lastUpdate.byGroup({ groupNumber } | { id }, options?)`
- `client.lastUpdate.byEmployee({ urlId } | { id }, options?)`

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
- helpers like `toCycleWeek()` validate positive integer input

Retry and abort behavior:

- Retries are applied to `429`, `500`, `502`, `503`, `504`
- `Retry-After` is respected for retriable responses
- Caller-provided aborted `AbortSignal` is re-thrown as native `AbortError`
- Internal timeout is mapped to `BsuirTimeoutError`

`createBsuirClient()` throws regular `Error` if no `fetch` implementation is available.

## Raw vs normalized schedule response

By default, schedule methods return normalized response with `lessons`, `lessonsByDay`,
`scheduleLessons`, and `examLessons`.

```ts
const raw = await client.schedule.getGroup("053503", { raw: true });
```

Use `defaultRaw: true` in `createBsuirClient` to change global behavior.
When `raw` is omitted, `getGroup()` and `getEmployee()` return normalized payload.
In raw mode API may return `schedules: null`; normalized mode always converts it to `{}`.
In raw mode some lesson fields may also be nullable (`weekNumber`, `lessonTypeAbbrev`), so keep null checks if you consume raw payload directly.

## Semester week vs cycle week

`getCurrentWeek()` returns the current semester week number from API.
For cycle week (1..4) use `getCurrentCycleWeek()` or helper `toCycleWeek()`.
The SDK normalizes `current-week` payloads, including plain-text responses like `1\n`.

```ts
import { toCycleWeek } from "bsuir-iis-api";

const semesterWeek = await client.schedule.getCurrentWeek();
const cycleWeek = toCycleWeek(semesterWeek); // default: 2 semester weeks per cycle week
```

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
