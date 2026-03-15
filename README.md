# bsuir-iis-api

Type-safe ESM SDK for [BSUIR IIS API](https://iis.bsuir.by/api/v1) with support for Node.js and browser runtimes.

## Install

```bash
npm install bsuir-iis-api
```

## Quick start

```ts
import { createBsuirClient } from "bsuir-iis-api";

const client = createBsuirClient();

const schedule = await client.schedule.getGroup("053503");
if ("lessons" in schedule) {
  console.log(schedule.lessons.length);
}
```

## Client options

```ts
const client = createBsuirClient({
  baseUrl: "https://iis.bsuir.by/api/v1",
  timeoutMs: 10000,
  retries: 2,
  retryDelayMs: 300,
  defaultRaw: false
});
```

- `fetch` can be passed for custom runtime/testing.
- `AbortSignal` is supported by all read methods.

## API

### Schedule

- `client.schedule.getGroup(groupNumber, options?)`
- `client.schedule.getEmployee(urlId, options?)`
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

### Meta

- `client.currentWeek.get(options?)`
- `client.lastUpdate.byGroup({ groupNumber } | { id }, options?)`
- `client.lastUpdate.byEmployee({ urlId } | { id }, options?)`

## Errors

SDK throws typed errors:

- `BsuirApiError` for HTTP errors (contains `status`, `endpoint`, `body`)
- `BsuirNetworkError` for transport errors
- `BsuirTimeoutError` for timeouts
- `BsuirValidationError` for invalid input parameters

## Raw vs normalized schedule response

By default, schedule methods return normalized response with `lessons` array.

```ts
const raw = await client.schedule.getGroup("053503", { raw: true });
```

Use `defaultRaw: true` in `createBsuirClient` to change global behavior.

## Development

```bash
npm install
npm run check
npm run build
```

## License

MIT
