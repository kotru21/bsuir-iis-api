# Quality Wave 2 (DX major) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Wave 2 DX: migration-note template, explicit subgroup schedule methods (breaking), soft-deprecate last-update, and `validateResponses` DX without flipping the default.

**Architecture:** Mirror `getGroup` / `getGroupRaw` for subgroup variants (`get*BySubgroup`, `get*BySubgroupRaw`, `get*BySubgroupEnvelope`). Remove `raw` / `rawEnvelope` overloads in the same major. Rename existing `getGroupEnvelope` / `getEmployeeEnvelope` to the `*BySubgroupEnvelope` names. Docs + optional `createBsuirClient.strict()`.

**Tech Stack:** TypeScript (strict), Vitest, api-extractor, Changesets.

**Spec:** `docs/superpowers/specs/2026-07-11-quality-wave-2-dx-design.md`

**Out of scope:** Wave 3 file splits / scheduleApi dedup; removing last-update; flipping `validateResponses` default.

---

## File map

| File                                              | Responsibility                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Modify: `src/modules/scheduleApi.ts`              | Explicit subgroup methods; remove flag overloads; rename envelopes; `@deprecated` last-update |
| Modify: `src/client/createClient.ts`              | `createBsuirClient.strict`; JSDoc updates                                                     |
| Modify: `src/client/types.ts`                     | Stronger `validateResponses` JSDoc                                                            |
| Modify: `test/modules/scheduleApi.raw.test.ts`    | Call new method names                                                                         |
| Modify: `test/modules/scheduleApi.newApi.test.ts` | Rename envelope tests                                                                         |
| Modify: `test/modules/schedule.test.ts`           | Replace `raw: true` with `getGroupBySubgroupRaw`                                              |
| Replace: `test/types/scheduleApi.overloads.ts`    | Type-level checks for new API (no flag overloads)                                             |
| Add: `test/client/createClient.strict.test.ts`    | `strict()` forces validateResponses                                                           |
| Modify: `README.md`                               | API list, migration note template + Wave 2 note, validateResponses, last-update deprecation   |
| Modify: `etc/bsuir-iis-api.api.md`                | Via `npm run api:report`                                                                      |
| Create: `.changeset/quality-wave-2-dx.md`         | Major changeset                                                                               |

---

### Task 1: Failing unit tests for explicit subgroup methods

**Files:**

- Modify: `test/modules/scheduleApi.raw.test.ts`
- Modify: `test/modules/scheduleApi.newApi.test.ts`
- Modify: `test/modules/schedule.test.ts`

- [ ] **Step 1: Rewrite subgroup tests to new names (expect fail until implementation)**

In `test/modules/scheduleApi.raw.test.ts`, replace flag-based cases with:

```ts
it("getGroupBySubgroupEnvelope preserves envelope fields and filters schedules", async () => {
  const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
  const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

  const response = await client.schedule.getGroupBySubgroupEnvelope("053503", 1);

  expect(response.startDate).toBe("01.09.2025");
  expect(response.endDate).toBe("30.12.2025");
  expect(response.exams).toHaveLength(1);
  expect(response.schedules?.Понедельник?.map((item) => item.numSubgroup)).toEqual([1]);
  expect(response.schedules?.Вторник?.map((item) => item.numSubgroup)).toEqual([1]);
});

it("getEmployeeBySubgroupEnvelope preserves envelope fields and filters schedules", async () => {
  const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
  const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

  const response = await client.schedule.getEmployeeBySubgroupEnvelope("s-nesterenkov", 1);

  expect(response.startDate).toBe("01.09.2025");
  expect(response.schedules?.Понедельник?.map((item) => item.numSubgroup)).toEqual([1]);
});

it("getGroupBySubgroupRaw returns filtered ScheduleItem array", async () => {
  const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildSubgroupPayload() })]);
  const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });

  const lessons = await client.schedule.getGroupBySubgroupRaw("053503", 2);
  expect(Array.isArray(lessons)).toBe(true);
  expect(lessons).toHaveLength(1);
  expect(lessons[0]?.numSubgroup).toBe(2);
  expect(lessons[0]?.subject).toBe("Physics");
});
```

Delete the test `"rawEnvelope takes precedence over raw: true in subgroup helpers"`.

In `test/modules/scheduleApi.newApi.test.ts`, rename:

- `getGroupEnvelope` → `getGroupBySubgroupEnvelope`
- `getEmployeeEnvelope` → `getEmployeeBySubgroupEnvelope`

In `test/modules/schedule.test.ts`, change:

```ts
const subgroupLessons = await client.schedule.getGroupBySubgroupRaw("053503", 1);
```

(replace `{ raw: true }` call) and rename the test title accordingly.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/modules/scheduleApi.raw.test.ts test/modules/scheduleApi.newApi.test.ts test/modules/schedule.test.ts
```

Expected: FAIL — `getGroupBySubgroupRaw` / `getGroupBySubgroupEnvelope` not functions (or type errors at compile if tsc runs first; vitest may still execute and throw).

- [ ] **Step 3: Implement explicit methods in `scheduleApi.ts`**

Update `ScheduleModule` interface and implementation:

1. Remove all `raw` / `rawEnvelope` overloads from `getGroupBySubgroup` / `getEmployeeBySubgroup`.
2. Default methods only accept `ReadOptions` and return flattened lessons via existing filtered helpers.
3. Add:

```ts
async function getGroupBySubgroupRaw(
  groupNumber: string,
  subgroup: number,
  options: ReadOptions = {}
): Promise<ScheduleItem[]> {
  assertPositiveInt(subgroup, "subgroup");
  const raw = await getGroupRaw(groupNumber, options);
  return filterRawSubgroupLessons(raw, subgroup);
}

async function getGroupBySubgroupEnvelope(
  groupNumber: string,
  subgroup: number,
  options: ReadOptions = {}
): Promise<ScheduleResponse> {
  assertPositiveInt(subgroup, "subgroup");
  const raw = await getGroupRaw(groupNumber, options);
  return filterRawSubgroupEnvelope(raw, subgroup);
}
```

(and employee mirrors).

4. Remove `getGroupEnvelope` / `getEmployeeEnvelope` exports (implementation can be the new named functions only).
5. Export the new methods from the returned object.

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
npx vitest run test/modules/scheduleApi.raw.test.ts test/modules/scheduleApi.newApi.test.ts test/modules/schedule.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/scheduleApi.ts test/modules/scheduleApi.raw.test.ts test/modules/scheduleApi.newApi.test.ts test/modules/schedule.test.ts
git commit -m "feat!: replace subgroup raw/rawEnvelope flags with explicit methods"
```

---

### Task 2: Type tests for new subgroup surface

**Files:**

- Replace: `test/types/scheduleApi.overloads.ts`

- [ ] **Step 1: Replace overload smoke with explicit-method type checks**

```ts
import { createBsuirClient } from "../../src";
import type {
  FlattenedScheduleItem,
  ScheduleItem,
  ScheduleResponse
} from "../../src/types/schedule";

const fetchImpl = (async () => new Response()) as typeof fetch;
const client = createBsuirClient({ fetch: fetchImpl });

const flat: Promise<FlattenedScheduleItem[]> = client.schedule.getGroupBySubgroup("053503", 1);
const raw: Promise<ScheduleItem[]> = client.schedule.getGroupBySubgroupRaw("053503", 1);
const envelope: Promise<ScheduleResponse> = client.schedule.getGroupBySubgroupEnvelope("053503", 1);

const empFlat: Promise<FlattenedScheduleItem[]> = client.schedule.getEmployeeBySubgroup(
  "s-nesterenkov",
  1
);
const empRaw: Promise<ScheduleItem[]> = client.schedule.getEmployeeBySubgroupRaw(
  "s-nesterenkov",
  1
);
const empEnvelope: Promise<ScheduleResponse> = client.schedule.getEmployeeBySubgroupEnvelope(
  "s-nesterenkov",
  1
);

void flat;
void raw;
void envelope;
void empFlat;
void empRaw;
void empEnvelope;

// @ts-expect-error raw flag removed from getGroupBySubgroup
void client.schedule.getGroupBySubgroup("053503", 1, { raw: true });

// @ts-expect-error rawEnvelope flag removed from getEmployeeBySubgroup
void client.schedule.getEmployeeBySubgroup("s-nesterenkov", 1, { rawEnvelope: true });

// @ts-expect-error old envelope helper renamed
void client.schedule.getGroupEnvelope("053503", 1);
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: PASS (the `@ts-expect-error` lines must be unused-error-free — i.e. they must actually error).

- [ ] **Step 3: Commit**

```bash
git add test/types/scheduleApi.overloads.ts
git commit -m "test: update scheduleApi type tests for explicit subgroup methods"
```

---

### Task 3: Soft-deprecate last-update (P1-2)

**Files:**

- Modify: `src/modules/scheduleApi.ts` (JSDoc on interface + implementations)
- Modify: `README.md` (later in Task 5 can batch docs; here add JSDoc only)

- [ ] **Step 1: Add `@deprecated` JSDoc**

On both interface methods and implementations:

```ts
/**
 * Calls IIS `/last-update-date/student-group`.
 *
 * @deprecated Legacy IIS endpoint; no longer maintained upstream. Six-digit
 * group numbers may fail. Prefer schedule `startDate`/`endDate` or your own
 * cache TTL. Planned for removal in a future major.
 */
async function getLastUpdateByGroup(...) { ... }
```

Mirror for employee (`/last-update-date/employee`).

Behavior must stay identical — no test changes required beyond docs.

- [ ] **Step 2: Commit**

```bash
git add src/modules/scheduleApi.ts
git commit -m "docs: deprecate schedule last-update helpers via JSDoc"
```

---

### Task 4: `createBsuirClient.strict` + validateResponses JSDoc (P1-3)

**Files:**

- Modify: `src/client/createClient.ts`
- Modify: `src/client/types.ts`
- Create: `test/client/createClient.strict.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { BsuirResponseValidationError, createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

describe("createBsuirClient.strict", () => {
  it("enables validateResponses so invalid catalog payloads throw", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "an-array" } })]);
    const client = createBsuirClient.strict({ fetch: fetchImpl });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("keeps default createBsuirClient validateResponses off", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "an-array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    await expect(client.groups.listAll()).resolves.toEqual({ not: "an-array" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run test/client/createClient.strict.test.ts
```

Expected: FAIL — `createBsuirClient.strict` is not a function.

- [ ] **Step 3: Implement**

After `createBsuirClient` definition in `createClient.ts`:

```ts
createBsuirClient.strict = function createBsuirClientStrict(
  options: BsuirClientOptions = {}
): BsuirClientShape {
  return createBsuirClient({ ...options, validateResponses: true });
};
```

Update `validateResponses` JSDoc in `types.ts` to mention `createBsuirClient.strict()` and reiterate default `false`.

Update module JSDoc on `createBsuirClient` to mention subgroup explicit helpers (drop `getGroupEnvelope` name).

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run test/client/createClient.strict.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/client/createClient.ts src/client/types.ts test/client/createClient.strict.test.ts
git commit -m "feat: add createBsuirClient.strict for validateResponses DX"
```

---

### Task 5: README migration template + Wave 2 notes (P3-4, docs)

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update API list**

Under Schedule, list:

```md
- `client.schedule.getGroupRaw(groupNumber, options?)`
- `client.schedule.getEmployeeRaw(urlId, options?)`
- `client.schedule.getGroupBySubgroup(groupNumber, subgroup, options?)`
- `client.schedule.getGroupBySubgroupRaw(groupNumber, subgroup, options?)`
- `client.schedule.getGroupBySubgroupEnvelope(groupNumber, subgroup, options?)`
- `client.schedule.getEmployeeBySubgroup(urlId, subgroup, options?)`
- `client.schedule.getEmployeeBySubgroupRaw(urlId, subgroup, options?)`
- `client.schedule.getEmployeeBySubgroupEnvelope(urlId, subgroup, options?)`
```

Mark last-update as **deprecated**.

Expand `validateResponses` bullet + mention `createBsuirClient.strict()`.

- [ ] **Step 2: Add migration-notes section**

After Release checklist (or before), add:

```md
## Migration notes (majors)

When this package ships a **major** (or a 0.x “major” changeset → e.g. 0.14.0), include a short note with:

1. **Removed / renamed** — what callers must change
2. **Mapping table** — old call → new call
3. **Search hints** — strings to find in consuming repos

### 0.14.0 — subgroup schedule helpers

| Before                                               | After                                 |
| ---------------------------------------------------- | ------------------------------------- |
| `getGroupBySubgroup(g, s, { raw: true })`            | `getGroupBySubgroupRaw(g, s)`         |
| `getGroupBySubgroup(g, s, { rawEnvelope: true })`    | `getGroupBySubgroupEnvelope(g, s)`    |
| `getEmployeeBySubgroup(u, s, { raw: true })`         | `getEmployeeBySubgroupRaw(u, s)`      |
| `getEmployeeBySubgroup(u, s, { rawEnvelope: true })` | `getEmployeeBySubgroupEnvelope(u, s)` |
| `getGroupEnvelope(g, s)`                             | `getGroupBySubgroupEnvelope(g, s)`    |
| `getEmployeeEnvelope(u, s)`                          | `getEmployeeBySubgroupEnvelope(u, s)` |

Default `get*BySubgroup(...)` (flattened lessons) is unchanged. Flags `raw` / `rawEnvelope` are removed.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: migration template and Wave 2 DX notes"
```

---

### Task 6: api-report, changeset, full check

**Files:**

- Create: `.changeset/quality-wave-2-dx.md`
- Modify: `etc/bsuir-iis-api.api.md` (generated)

- [ ] **Step 1: Build + api report**

```bash
npm run build
npm run api:report
```

- [ ] **Step 2: Add major changeset**

```md
---
"bsuir-iis-api": major
---

Simplify subgroup schedule API and improve validateResponses DX.

**Breaking:** `get*BySubgroup` no longer accepts `raw` / `rawEnvelope`. Use `get*BySubgroupRaw` / `get*BySubgroupEnvelope`. `getGroupEnvelope` / `getEmployeeEnvelope` renamed to `get*BySubgroupEnvelope`. See README migration notes.

Also: `@deprecated` last-update helpers; `createBsuirClient.strict()` enables `validateResponses` (default remains `false`).
```

- [ ] **Step 3: Full check**

```bash
npm run check:full
```

Expected: PASS.

Optional live:

```powershell
$env:BSUIR_LIVE_TESTS="1"; npm run test:live
```

Soft-skip on schedule 503 is OK.

- [ ] **Step 4: Final commit**

```bash
git add etc/bsuir-iis-api.api.md .changeset/quality-wave-2-dx.md docs/superpowers/specs/2026-07-11-quality-wave-2-dx-design.md docs/superpowers/plans/2026-07-11-quality-wave-2-dx.md
git commit -m "chore: api report, changeset, and Wave 2 docs"
```

---

### Task 7: PR, squash-merge, version, publish

- [ ] Push branch, open PR with summary + test plan
- [ ] Squash-merge (repo norm)
- [ ] On `main`: `npx changeset version` → commit → push (triggers publish)
- [ ] Confirm npm publish of expected version (likely **0.14.0**)

---

## Self-review

1. **Spec coverage:** P3-4 template (Task 5), P1-1 (Tasks 1–2), P1-2 (Task 3 + README), P1-3 (Task 4 + README) — covered.
2. **Placeholders:** none.
3. **Naming:** `get*BySubgroupRaw` / `get*BySubgroupEnvelope` consistent with design rename map; old `get*Envelope` removed.
