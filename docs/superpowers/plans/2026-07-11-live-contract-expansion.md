# Live Contract Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the opt-in live contract monolith into domain suites under `test/integration/live/` so weekly CI catches IIS drift and SDK regressions on real payloads, with soft-skip for schedule-dependent suites when IIS probes fail.

**Architecture:** Shared `gate.ts` / `client.ts` / `fixtures.ts` helpers; four Vitest files (`catalogs`, `schedule`, `announcements`, `strict-and-helpers`). Catalogs + announcements always run and must pass; schedule + strict/helpers soft-skip after a shared ~50-candidate probe. Delete `test/integration/live-api.contract.test.ts`. Wire `test:live` to the folder; patch changeset only (docs/tests).

**Tech Stack:** TypeScript (strict), Vitest 4.x (`describe` / `describe.skip`, task-context `skip()`), existing `createBsuirClient` / `createBsuirClient.strict`, `getTodayLessons` / `buildScheduleDays`, Changesets, GitHub Actions weekly workflow.

**Spec:** `docs/superpowers/specs/2026-07-11-live-contract-expansion-design.md`

---

## File map

| File                                                            | Responsibility                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Create: `test/integration/live/gate.ts`                         | `runLiveTests` + `describeLive` (`describe` vs `describe.skip`)                                    |
| Create: `test/integration/live/client.ts`                       | Shared live client factory (timeout/retries matching today’s monolith)                             |
| Create: `test/integration/live/fixtures.ts`                     | Hardcoded `urlId` / `departmentId` + cached `findWorkingGroupNumber` / `findWorkingEmployeeUrlId`  |
| Create: `test/integration/live/catalogs.live.test.ts`           | Six `listAll` shape canaries (must pass)                                                           |
| Create: `test/integration/live/schedule.live.test.ts`           | Normalized/raw/exams/filtered/subgroup/`getCurrentWeek`/soft last-update; soft-skip if probe empty |
| Create: `test/integration/live/announcements.live.test.ts`      | Wave 1 multipage canary + `byDepartment` 400/422 → `[]`; optional `treat404AsEmpty: false`         |
| Create: `test/integration/live/strict-and-helpers.live.test.ts` | Strict client smoke + `getTodayLessons` / `buildScheduleDays`; same soft-skip gate                 |
| Delete: `test/integration/live-api.contract.test.ts`            | Prefer delete over thin re-export                                                                  |
| Modify: `package.json`                                          | `"test:live": "vitest run test/integration/live"`                                                  |
| Modify: `.github/workflows/live-contract.yml`                   | Keep cron + `npm run test:live` + `BSUIR_LIVE_TESTS: "1"`; add comment pointing at `live/`         |
| Modify: `README.md`                                             | Mention `test/integration/live/` entrypoint                                                        |
| Modify: `CONTRIBUTING.md`                                       | One-liner still valid; note live folder if helpful                                                 |
| Create: `.changeset/live-contract-expansion.md`                 | Patch: docs + live tests only                                                                      |

**Public API:** No production code changes. No `validateResponses` default flip.

**Vitest notes (Context7):** Use `describe.skip` when the suite should not run (gate off). For async soft-skip after IIS probe, use Vitest task-context `skip()` inside each `it` (do not use `describe.skipIf` — that is evaluated at collection time). `vitest run test/integration/live` runs all matching files under that directory (`vitest.config.ts` include: `test/**/*.test.ts`, so `*.live.test.ts` matches).

---

### Task 1: Shared live gate

**Files:**

- Create: `test/integration/live/gate.ts`

- [ ] **Step 1: Create `gate.ts`**

```ts
import { describe } from "vitest";

export const runLiveTests = process.env.BSUIR_LIVE_TESTS === "1";

/** Use instead of `describe` in every live suite — skips when gate is off. */
export const describeLive = runLiveTests ? describe : describe.skip;
```

- [ ] **Step 2: Smoke that the module loads**

Run:

```powershell
npx vitest run test/integration/live/gate.ts
```

Expected: Vitest reports no test files (or 0 tests) — `gate.ts` is not a `*.test.ts`. Exit 0 or “No test files found” is fine. Do not treat this as a failure of the gate itself.

- [ ] **Step 3: Commit**

```bash
git add test/integration/live/gate.ts
git commit -m "test: add shared live-contract gate helper"
```

---

### Task 2: Shared live client factory

**Files:**

- Create: `test/integration/live/client.ts`

- [ ] **Step 1: Create `client.ts`**

Match today’s monolith defaults exactly:

```ts
import { createBsuirClient } from "../../../src";

export function createLiveClient() {
  return createBsuirClient({
    timeoutMs: 15_000,
    retries: 2,
    retryDelayMs: 400,
    retryMaxDelayMs: 2000,
    retryJitter: true
  });
}

export type LiveClient = ReturnType<typeof createLiveClient>;
```

- [ ] **Step 2: Commit**

```bash
git add test/integration/live/client.ts
git commit -m "test: add shared live-contract client factory"
```

---

### Task 3: Shared fixtures and schedule probes

**Files:**

- Create: `test/integration/live/fixtures.ts`

- [ ] **Step 1: Create `fixtures.ts` with cached probes**

Move probe logic from the monolith. Cache results so `schedule` and `strict-and-helpers` share one probe per Vitest process (spec: do not invent a second probe).

```ts
import { BsuirApiError } from "../../../src/client/errors";
import type { LiveClient } from "./client";

/** Known employee fixture used by announcements + soft last-update. */
export const LIVE_EMPLOYEE_URL_ID = "s-nesterenkov";

/** Known department id used by announcements.byDepartment. */
export const LIVE_DEPARTMENT_ID = 20_027;

const PROBE_LIMIT = 50;

let cachedWorkingGroupNumber: string | undefined | null = null;
let cachedWorkingEmployeeUrlId: string | undefined | null = null;

function isTransientScheduleMiss(error: unknown): boolean {
  return (
    error instanceof BsuirApiError &&
    (error.status === 404 || error.status === 503 || error.message.includes("Invalid JSON"))
  );
}

export async function findWorkingGroupNumber(client: LiveClient): Promise<string | undefined> {
  if (cachedWorkingGroupNumber !== null) {
    return cachedWorkingGroupNumber ?? undefined;
  }

  const groups = await client.groups.listAll();
  for (const group of groups.slice(0, PROBE_LIMIT)) {
    try {
      await client.schedule.getGroupRaw(group.name);
      cachedWorkingGroupNumber = group.name;
      return group.name;
    } catch (error) {
      if (isTransientScheduleMiss(error)) {
        continue;
      }
      throw error;
    }
  }

  cachedWorkingGroupNumber = undefined;
  return undefined;
}

export async function findWorkingEmployeeUrlId(client: LiveClient): Promise<string | undefined> {
  if (cachedWorkingEmployeeUrlId !== null) {
    return cachedWorkingEmployeeUrlId ?? undefined;
  }

  const employees = await client.employees.listAll();
  for (const employee of employees.slice(0, PROBE_LIMIT)) {
    try {
      await client.schedule.getEmployeeRaw(employee.urlId);
      cachedWorkingEmployeeUrlId = employee.urlId;
      return employee.urlId;
    } catch (error) {
      if (isTransientScheduleMiss(error)) {
        continue;
      }
      throw error;
    }
  }

  cachedWorkingEmployeeUrlId = undefined;
  return undefined;
}

export async function resolveWorkingScheduleEntities(client: LiveClient): Promise<{
  groupNumber: string | undefined;
  employeeUrlId: string | undefined;
  available: boolean;
}> {
  const [groupNumber, employeeUrlId] = await Promise.all([
    findWorkingGroupNumber(client),
    findWorkingEmployeeUrlId(client)
  ]);
  return {
    groupNumber,
    employeeUrlId,
    available: Boolean(groupNumber && employeeUrlId)
  };
}

export const SCHEDULE_PROBE_WARN =
  "Skipping schedule-dependent live assertions: no working group/employee schedule available from IIS";
```

- [ ] **Step 2: Commit**

```bash
git add test/integration/live/fixtures.ts
git commit -m "test: add live fixtures and cached schedule probes"
```

---

### Task 4: Catalogs live suite (must pass)

**Files:**

- Create: `test/integration/live/catalogs.live.test.ts`

- [ ] **Step 1: Write catalogs suite (from monolith catalog canary)**

```ts
import { expect, it } from "vitest";
import type { EmployeeCatalogItem } from "../../../src/types/employee";
import type { Department, StudentGroupCatalogItem } from "../../../src/types/catalog";
import { createLiveClient } from "./client";
import { describeLive } from "./gate";

describeLive("live catalogs contract", () => {
  const client = createLiveClient();

  it("loads all six listAll catalogs and validates minimal DTO shape", async () => {
    const [groups, employees, departments, faculties, specialities, auditories] = await Promise.all(
      [
        client.groups.listAll(),
        client.employees.listAll(),
        client.departments.listAll(),
        client.faculties.listAll(),
        client.specialities.listAll(),
        client.auditories.listAll()
      ]
    );

    for (const [label, value] of [
      ["groups", groups],
      ["employees", employees],
      ["departments", departments],
      ["faculties", faculties],
      ["specialities", specialities],
      ["auditories", auditories]
    ] as const) {
      expect(Array.isArray(value), `${label} must be an array (not a page object)`).toBe(true);
      expect(value, `${label} must not look like a raw Spring page`).not.toHaveProperty("content");
    }

    const sampleGroup = groups[0] as StudentGroupCatalogItem | undefined;
    const sampleEmployee = employees[0] as EmployeeCatalogItem | undefined;
    const sampleDepartment = departments[0] as Department | undefined;

    expect(sampleGroup?.name).toEqual(expect.any(String));
    expect(sampleGroup?.id).toEqual(expect.any(Number));
    expect(sampleEmployee?.urlId).toEqual(expect.any(String));
    expect(sampleEmployee?.id).toEqual(expect.any(Number));
    expect(sampleDepartment?.id).toEqual(expect.any(Number));
  }, 60_000);
});
```

- [ ] **Step 2: Run with gate off (must skip)**

Run:

```powershell
npx vitest run test/integration/live/catalogs.live.test.ts
```

Expected: Suite skipped (`describe.skip` via `describeLive`). Exit 0.

- [ ] **Step 3: Commit**

```bash
git add test/integration/live/catalogs.live.test.ts
git commit -m "test: add live catalogs domain contract suite"
```

---

### Task 5: Announcements live suite (must pass)

**Files:**

- Create: `test/integration/live/announcements.live.test.ts`

- [ ] **Step 1: Write announcements suite**

Move Wave 1 multipage canary + `byDepartment` 400/422 → `[]` from the monolith. For `treat404AsEmpty: false`: use a documented `it.skip` unless you have a stably reproducible 404 id on live IIS (spec: do not flake weekly).

```ts
import { expect, it } from "vitest";
import { BsuirApiError } from "../../../src/client/errors";
import { createLiveClient } from "./client";
import { LIVE_DEPARTMENT_ID, LIVE_EMPLOYEE_URL_ID } from "./fixtures";
import { describeLive } from "./gate";

describeLive("live announcements contract", () => {
  const client = createLiveClient();

  it("byEmployee / byDepartment return arrays (400/422 department → [])", async () => {
    const employeeAnnouncements = await client.announcements.byEmployee(LIVE_EMPLOYEE_URL_ID);

    let departmentAnnouncements: unknown;
    try {
      departmentAnnouncements = await client.announcements.byDepartment(LIVE_DEPARTMENT_ID);
    } catch (error) {
      if (error instanceof BsuirApiError && [400, 422].includes(error.status)) {
        departmentAnnouncements = [];
      } else {
        throw error;
      }
    }

    expect(Array.isArray(employeeAnnouncements)).toBe(true);
    expect(Array.isArray(departmentAnnouncements)).toBe(true);
  }, 60_000);

  it("announcements endpoints return array or Spring page; SDK yields array", async () => {
    const baseUrl = "https://iis.bsuir.by/api/v1";
    const rawEmployeeUrl = `${baseUrl}/announcements/employees?url-id=${LIVE_EMPLOYEE_URL_ID}`;
    let capturedTotalElements: number | undefined;

    const rawResponse = await fetch(rawEmployeeUrl, {
      headers: { Accept: "application/json" }
    });
    expect(rawResponse.ok || rawResponse.status === 404).toBe(true);

    if (rawResponse.ok) {
      const rawPayload: unknown = await rawResponse.json();
      const isArray = Array.isArray(rawPayload);
      const isPage =
        typeof rawPayload === "object" &&
        rawPayload !== null &&
        Array.isArray((rawPayload as { content?: unknown }).content);
      expect(isArray || isPage).toBe(true);

      if (isPage) {
        const page = rawPayload as {
          content: unknown[];
          totalPages?: number;
          totalElements?: number;
          last?: boolean;
        };
        expect(page.content).toEqual(expect.any(Array));
        if (typeof page.totalPages === "number") {
          expect(page.totalPages).toBeGreaterThanOrEqual(1);
        }
        if (typeof page.totalElements === "number") {
          capturedTotalElements = page.totalElements;
        }
        if (page.last === false || (typeof page.totalPages === "number" && page.totalPages > 1)) {
          expect(page.content.length).toBeGreaterThan(0);
        }
      } else if (isArray) {
        capturedTotalElements = rawPayload.length;
      }
    }

    const pagedUrl = `${baseUrl}/announcements/employees?url-id=${LIVE_EMPLOYEE_URL_ID}&page=0&size=5`;
    const pagedResponse = await fetch(pagedUrl, {
      headers: { Accept: "application/json" }
    });
    if (pagedResponse.ok) {
      const pagedPayload: unknown = await pagedResponse.json();
      if (
        typeof pagedPayload === "object" &&
        pagedPayload !== null &&
        Array.isArray((pagedPayload as { content?: unknown }).content)
      ) {
        const page = pagedPayload as {
          content: unknown[];
          totalPages?: number;
          last?: boolean;
        };
        expect(page.content.length).toBeGreaterThan(0);
        expect(page.content.length).toBeLessThanOrEqual(5);
        if (typeof page.totalPages === "number" && page.totalPages > 1) {
          expect(page.last).toBe(false);
          const page1Url = `${baseUrl}/announcements/employees?url-id=${LIVE_EMPLOYEE_URL_ID}&page=1&size=5`;
          const page1Response = await fetch(page1Url, {
            headers: { Accept: "application/json" }
          });
          expect(page1Response.ok).toBe(true);
          const page1Payload: unknown = await page1Response.json();
          expect(Array.isArray((page1Payload as { content?: unknown }).content)).toBe(true);
        }
      }
    }

    const viaSdk = await client.announcements.byEmployee(LIVE_EMPLOYEE_URL_ID);
    expect(Array.isArray(viaSdk)).toBe(true);
    if (typeof capturedTotalElements === "number") {
      expect(viaSdk.length).toBe(capturedTotalElements);
    }
  }, 60_000);

  // Documented skip: live IIS does not expose a stably reproducible empty/404
  // announcements id for weekly CI. Re-enable only when a fixed probe id is known.
  it.skip("treat404AsEmpty: false surfaces BsuirApiError on known-empty id", async () => {
    await expect(
      client.announcements.byEmployee("__no-such-employee-url-id__", {
        treat404AsEmpty: false
      })
    ).rejects.toBeInstanceOf(BsuirApiError);
  });
});
```

- [ ] **Step 2: Run with gate off**

```powershell
npx vitest run test/integration/live/announcements.live.test.ts
```

Expected: Suite skipped. Exit 0.

- [ ] **Step 3: Commit**

```bash
git add test/integration/live/announcements.live.test.ts
git commit -m "test: add live announcements domain contract suite"
```

---

### Task 6: Schedule live suite (soft-skip when probe empty)

**Files:**

- Create: `test/integration/live/schedule.live.test.ts`

- [ ] **Step 1: Write schedule suite**

Use `beforeAll` + shared probe; soft-skip via Vitest task-context `skip()` when `available` is false. Warn once in `beforeAll`. Assert all calls from the spec table (subgroup `1` only). Soft deprecated last-update with eslint-disable reason.

```ts
import { beforeAll, expect, it } from "vitest";
import { BsuirApiError } from "../../../src/client/errors";
import { createLiveClient } from "./client";
import {
  LIVE_EMPLOYEE_URL_ID,
  resolveWorkingScheduleEntities,
  SCHEDULE_PROBE_WARN
} from "./fixtures";
import { describeLive } from "./gate";

describeLive("live schedule contract", () => {
  const client = createLiveClient();
  let groupNumber: string | undefined;
  let employeeUrlId: string | undefined;
  let scheduleAvailable = false;

  beforeAll(async () => {
    const resolved = await resolveWorkingScheduleEntities(client);
    groupNumber = resolved.groupNumber;
    employeeUrlId = resolved.employeeUrlId;
    scheduleAvailable = resolved.available;
    if (!scheduleAvailable) {
      console.warn(SCHEDULE_PROBE_WARN);
    }
  }, 60_000);

  it("normalized getGroup / getEmployee expose lessons + schedules", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupSchedule, employeeSchedule] = await Promise.all([
      client.schedule.getGroup(groupNumber),
      client.schedule.getEmployee(employeeUrlId)
    ]);

    expect(groupSchedule).toHaveProperty("lessons");
    expect(groupSchedule).toHaveProperty("schedules");
    expect(employeeSchedule).toHaveProperty("lessons");
    expect(employeeSchedule).toHaveProperty("schedules");
  }, 60_000);

  it("raw envelopes expose schedules object or null", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupRaw, employeeRaw] = await Promise.all([
      client.schedule.getGroupRaw(groupNumber),
      client.schedule.getEmployeeRaw(employeeUrlId)
    ]);

    expect(groupRaw.schedules === null || typeof groupRaw.schedules === "object").toBe(true);
    expect(employeeRaw.schedules === null || typeof employeeRaw.schedules === "object").toBe(true);
  }, 60_000);

  it("exams and filtered(source: schedules) return arrays", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [groupExams, employeeExams, groupFiltered, employeeFiltered] = await Promise.all([
      client.schedule.getGroupExams(groupNumber),
      client.schedule.getEmployeeExams(employeeUrlId),
      client.schedule.getGroupFiltered(groupNumber, { source: "schedules" }),
      client.schedule.getEmployeeFiltered(employeeUrlId, { source: "schedules" })
    ]);

    expect(Array.isArray(groupExams)).toBe(true);
    expect(Array.isArray(employeeExams)).toBe(true);
    expect(Array.isArray(groupFiltered)).toBe(true);
    expect(Array.isArray(employeeFiltered)).toBe(true);
  }, 60_000);

  it("subgroup 1 default / raw / envelope shapes", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber || !employeeUrlId) {
      skip();
      return;
    }

    const [
      groupBySubgroup,
      groupBySubgroupRaw,
      groupBySubgroupEnvelope,
      employeeBySubgroup,
      employeeBySubgroupRaw,
      employeeBySubgroupEnvelope
    ] = await Promise.all([
      client.schedule.getGroupBySubgroup(groupNumber, 1),
      client.schedule.getGroupBySubgroupRaw(groupNumber, 1),
      client.schedule.getGroupBySubgroupEnvelope(groupNumber, 1),
      client.schedule.getEmployeeBySubgroup(employeeUrlId, 1),
      client.schedule.getEmployeeBySubgroupRaw(employeeUrlId, 1),
      client.schedule.getEmployeeBySubgroupEnvelope(employeeUrlId, 1)
    ]);

    expect(Array.isArray(groupBySubgroup)).toBe(true);
    expect(Array.isArray(groupBySubgroupRaw)).toBe(true);
    expect(Array.isArray(employeeBySubgroup)).toBe(true);
    expect(Array.isArray(employeeBySubgroupRaw)).toBe(true);
    expect(groupBySubgroupEnvelope).toHaveProperty("schedules");
    expect(employeeBySubgroupEnvelope).toHaveProperty("schedules");
  }, 60_000);

  it("getCurrentWeek returns a number", async ({ skip }) => {
    if (!scheduleAvailable) {
      skip();
      return;
    }

    const currentWeek = await client.schedule.getCurrentWeek();
    expect(currentWeek).toEqual(expect.any(Number));
  }, 60_000);

  it("soft last-update checks (deprecated until removal)", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber) {
      skip();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
    const employeeUpdate = await client.schedule.getLastUpdateByEmployee({
      urlId: LIVE_EMPLOYEE_URL_ID
    });
    expect(employeeUpdate.lastUpdateDate).toEqual(expect.any(String));

    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing soft-deprecated last-update until removal
      const groupUpdate = await client.schedule.getLastUpdateByGroup({
        groupNumber
      });
      expect(groupUpdate.lastUpdateDate).toEqual(expect.any(String));
    } catch (error) {
      if (!(error instanceof BsuirApiError)) {
        throw error;
      }
      // Legacy IIS endpoint; may fail for newer group identifiers (e.g. six-digit 524404).
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run with gate off**

```powershell
npx vitest run test/integration/live/schedule.live.test.ts
```

Expected: Suite skipped. Exit 0.

- [ ] **Step 3: Commit**

```bash
git add test/integration/live/schedule.live.test.ts
git commit -m "test: add live schedule domain contract suite"
```

---

### Task 7: Strict + helpers live suite (soft-skip without schedule)

**Files:**

- Create: `test/integration/live/strict-and-helpers.live.test.ts`

- [ ] **Step 1: Write strict + helpers suite**

Prefer `createBsuirClient.strict(...)` with the same timeout/retries. Soft-skip entire suite when schedule probe fails (reuse `resolveWorkingScheduleEntities` — no second probe). Do not run catalog-only strict here.

```ts
import { beforeAll, expect, it } from "vitest";
import { createBsuirClient } from "../../../src";
import { buildScheduleDays, getTodayLessons } from "../../../src";
import { resolveWorkingScheduleEntities, SCHEDULE_PROBE_WARN } from "./fixtures";
import { describeLive } from "./gate";

describeLive("live strict client and schedule helpers", () => {
  const strictClient = createBsuirClient.strict({
    timeoutMs: 15_000,
    retries: 2,
    retryDelayMs: 400,
    retryMaxDelayMs: 2000,
    retryJitter: true
  });

  let groupNumber: string | undefined;
  let scheduleAvailable = false;

  beforeAll(async () => {
    // Same cached probe as schedule.live.test.ts (fixtures module cache).
    const resolved = await resolveWorkingScheduleEntities(strictClient);
    groupNumber = resolved.groupNumber;
    scheduleAvailable = resolved.available;
    if (!scheduleAvailable) {
      console.warn(SCHEDULE_PROBE_WARN);
    }
  }, 60_000);

  it("strict client listAll + getGroup do not throw on live payloads", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber) {
      skip();
      return;
    }

    await expect(strictClient.groups.listAll()).resolves.toEqual(expect.any(Array));
    await expect(strictClient.schedule.getGroup(groupNumber)).resolves.toMatchObject({
      lessons: expect.any(Array),
      schedules: expect.any(Object)
    });
  }, 60_000);

  it("getTodayLessons and buildScheduleDays work on live normalized schedule", async ({ skip }) => {
    if (!scheduleAvailable || !groupNumber) {
      skip();
      return;
    }

    const normalized = await strictClient.schedule.getGroup(groupNumber);
    const todayLessons = getTodayLessons(normalized, new Date());
    expect(Array.isArray(todayLessons)).toBe(true);

    const days = buildScheduleDays(normalized, { days: 7 });
    expect(Array.isArray(days)).toBe(true);
    expect(days.length).toBeLessThanOrEqual(7);
    for (const day of days) {
      expect(day).toHaveProperty("dateKey");
      expect(typeof day.dateKey).toBe("string");
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run with gate off**

```powershell
npx vitest run test/integration/live/strict-and-helpers.live.test.ts
```

Expected: Suite skipped. Exit 0.

- [ ] **Step 3: Commit**

```bash
git add test/integration/live/strict-and-helpers.live.test.ts
git commit -m "test: add live strict client and helpers contract suite"
```

---

### Task 8: Delete monolith and point `test:live` at the folder

**Files:**

- Delete: `test/integration/live-api.contract.test.ts`
- Modify: `package.json` (script `test:live`)

- [ ] **Step 1: Delete the monolith**

Delete `test/integration/live-api.contract.test.ts` entirely (no re-export shim).

- [ ] **Step 2: Update `package.json` script**

Change:

```json
"test:live": "vitest run test/integration/live-api.contract.test.ts"
```

to:

```json
"test:live": "vitest run test/integration/live"
```

- [ ] **Step 3: Verify gate-off behavior for the folder**

Run:

```powershell
npm run test:live
```

Expected: All live suites skipped (`BSUIR_LIVE_TESTS` unset). Exit 0. Default `npm test` still unit-only (live files skip).

- [ ] **Step 4: Commit**

```bash
git add package.json
git rm test/integration/live-api.contract.test.ts
git commit -m "test: replace live monolith with domain suites under live/"
```

---

### Task 9: Workflow + README + CONTRIBUTING

**Files:**

- Modify: `.github/workflows/live-contract.yml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Annotate the workflow (no cron / command change)**

Keep `cron: "0 6 * * 1"`, `workflow_dispatch`, `npm run test:live`, and `BSUIR_LIVE_TESTS: "1"`. Add a short comment so the path change is discoverable:

```yml
name: Live contract

on:
  schedule:
    # Mondays 06:00 UTC — weekly smoke against the real BSUIR IIS API.
    - cron: "0 6 * * 1"
  workflow_dispatch:

jobs:
  live-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      # Domain suites under test/integration/live/ (via package.json test:live).
      - run: npm run test:live
        env:
          BSUIR_LIVE_TESTS: "1"
```

- [ ] **Step 2: Update README live-test blurb**

In `README.md`, under the live contract section (~lines 225–238), keep the same commands but mention the folder:

````markdown
Live contract tests against real BSUIR API are opt-in (`test/integration/live/`):

```bash
BSUIR_LIVE_TESTS=1 npm run test:live
```
````

PowerShell:

```powershell
$env:BSUIR_LIVE_TESTS="1"; npm run test:live
```

GitHub Actions runs live contracts weekly (Mondays 06:00 UTC) and on demand via the
**Live contract** workflow (`workflow_dispatch`). Catalogs and announcements must pass;
schedule / strict / helpers soft-skip with a warning when IIS probes find no working entities.

````

- [ ] **Step 3: Update CONTRIBUTING one-liner**

Change the setup block line to:

```bash
npm test             # unit tests (live: BSUIR_LIVE_TESTS=1 npm run test:live → test/integration/live/)
````

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/live-contract.yml README.md CONTRIBUTING.md
git commit -m "docs: point live contracts at test/integration/live/"
```

---

### Task 10: Patch changeset

**Files:**

- Create: `.changeset/live-contract-expansion.md`

- [ ] **Step 1: Add patch changeset (docs/tests only)**

```md
---
"bsuir-iis-api": patch
---

Expand opt-in live contract coverage into domain suites under `test/integration/live/`.

- Split catalogs, schedule, announcements, and strict/helpers canaries out of the old monolith.
- Soft-skip schedule-dependent suites when IIS probes find no working group/employee.
- Docs and `test:live` entrypoint updated; no public API change.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/live-contract-expansion.md
git commit -m "chore: add patch changeset for live contract expansion"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit gate — `npm run check`**

Run:

```powershell
npm run check
```

Expected: lint + typecheck + unit tests green. Live suites remain skipped. No production behavior change.

- [ ] **Step 2: Live gate on**

Run:

```powershell
$env:BSUIR_LIVE_TESTS="1"; npm run test:live
```

Expected (either is success per done criteria):

1. **Full green:** catalogs + announcements pass; schedule + strict/helpers pass against probed entities; or
2. **Soft-skip OK:** catalogs + announcements pass; schedule + strict/helpers skip with a single `console.warn` matching `SCHEDULE_PROBE_WARN`; job still exits 0.

Do **not** assert exact lesson counts, announcement bodies, or IIS latency.

- [ ] **Step 3: Confirm monolith gone and script path**

```powershell
Test-Path test/integration/live-api.contract.test.ts
# Expected: False

Select-String -Path package.json -Pattern '"test:live"'
# Expected: vitest run test/integration/live
```

- [ ] **Step 4: Final commit only if verification drove small fixes**

If Step 1–3 required tiny fixes, commit those with a focused message (e.g. `test: fix live soft-skip warn once`). Otherwise stop — no empty commit.

---

## Self-review (against spec)

| Spec requirement                                                                              | Plan task                |
| --------------------------------------------------------------------------------------------- | ------------------------ |
| Domain suites under `test/integration/live/`                                                  | Tasks 1–7                |
| `gate.ts` / `client.ts` / `fixtures.ts`                                                       | Tasks 1–3                |
| Catalogs: six `listAll` + no Spring `content` + sample fields                                 | Task 4                   |
| Schedule: normalized/raw/exams/filtered/subgroup×3/`getCurrentWeek`/soft last-update          | Task 6                   |
| Soft-skip schedule when probe fails (~50, 404/503/Invalid JSON)                               | Tasks 3, 6               |
| Announcements multipage canary + byDepartment 400/422 → `[]`                                  | Task 5                   |
| `treat404AsEmpty: false` only if stable, else documented skip                                 | Task 5 (`it.skip`)       |
| Strict smoke + `getTodayLessons` / `buildScheduleDays`; soft-skip without schedule            | Task 7                   |
| Shared probe (no second probe)                                                                | Task 3 cache + Tasks 6–7 |
| Delete monolith                                                                               | Task 8                   |
| `package.json` `test:live` → `vitest run test/integration/live`                               | Task 8                   |
| Workflow cron unchanged; still `npm run test:live` + `BSUIR_LIVE_TESTS=1`                     | Task 9                   |
| README + CONTRIBUTING                                                                         | Task 9                   |
| Patch changeset                                                                               | Task 10                  |
| Verify with `BSUIR_LIVE_TESTS=1` + `npm run check`                                            | Task 11                  |
| Out of scope: cache/hooks/retry matrix, deep schema audit, catalog fetch-all pages, CI matrix | Not planned              |

**Placeholder scan:** No TBD/TODO/“similar to Task N” leftovers; every create/modify step includes concrete code or exact edits.

**Type consistency:** `LiveClient`, `LIVE_EMPLOYEE_URL_ID`, `LIVE_DEPARTMENT_ID`, `resolveWorkingScheduleEntities`, `SCHEDULE_PROBE_WARN`, `describeLive`, `createLiveClient` naming is consistent across tasks.

**Gaps found during review:** none — `treat404AsEmpty` covered as documented skip; workflow path change is via `package.json` with an explanatory YAML comment only.
