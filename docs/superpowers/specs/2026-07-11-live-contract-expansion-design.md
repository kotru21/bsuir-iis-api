# Live contract expansion — design

**Date:** 2026-07-11  
**Package:** `bsuir-iis-api`  
**Status:** approved in brainstorm; not yet implemented  
**Related:** Wave 0–1 live canaries; Wave 2 `.strict()` / `validateResponses` DX

## Goal

Expand opt-in live contracts so that they serve two purposes:

| Goal | Meaning |
| ---- | ------- |
| **(A) IIS drift detection** | Catch upstream envelope/shape/status changes before consumers hit them |
| **(B) SDK regressions on real data** | Catch normalize / multi-page / subgroup / helper breakage against live payloads |

This is not coverage-for-coverage: every assertion maps to A, B, or both.

## Locked decisions (from brainstorm)

| Topic | Choice | Why |
| ----- | ------ | --- |
| Why expand | **A + B** (drift + SDK regressions) | CI stability alone is not the driver |
| Scope intensity | **Broad (C)** — almost all public **read** API live | Plus strict/`validateResponses` smoke and helper smoke |
| IIS instability | **Soft-skip schedule-dependent tests** with `console.warn` when no working group/employee | Catalogs + announcements **must** pass |
| Broad extras | **Strict smoke + helpers** (`getTodayLessons`, `buildScheduleDays`) | Unit alone misses real envelope quirks |
| Approach | **Domain suites under `test/integration/live/`** | Not a monolith; not a CI parallel matrix |
| Old monolith | **Delete** `test/integration/live-api.contract.test.ts` | Prefer delete over thin re-export |
| Semver | **Patch** changeset (docs/tests only) | No public API change |

## Constraints

- Gate remains `BSUIR_LIVE_TESTS=1`; default `npm test` stays unit-only.
- Weekly workflow schedule unchanged (`cron: "0 6 * * 1"` + `workflow_dispatch`).
- Soft-skip probe treats `404` / `503` / message containing `Invalid JSON` as “try next entity”; after ~50 candidates, warn and skip schedule-dependent suites.
- Do not assert exact lesson counts, announcement text, or IIS latency.
- Do not flip `validateResponses` default; strict is opt-in smoke only.

## Scope

### In scope

- Reorganize live tests into `test/integration/live/` domain suites
- Catalogs: all six `listAll` shape canaries
- Schedule: normalized, raw envelopes, exams, filtered (`source: "schedules"`), subgroup default + Raw + Envelope, `getCurrentWeek`; optional soft deprecated last-update
- Announcements: keep Wave 1 multipage canary; `byDepartment` 400/422 → `[]`; `treat404AsEmpty: false` only if stable, else documented skip
- Strict client smoke on 1–2 endpoints
- Helper smoke on live normalized schedule: `getTodayLessons` + `buildScheduleDays`
- Update `package.json` `test:live`, `.github/workflows/live-contract.yml`, README / CONTRIBUTING mentions

### Out of scope

- Cache / hooks / retry / abort / timeout live coverage (unit / browser suffice)
- Deep per-field schema audit
- Catalog fetch-all pages (SDK still first-page for catalogs)
- Removing deprecated last-update (optional soft assert only)
- CI parallel matrix jobs per domain

## Approach (rejected alternatives)

| Approach | Verdict |
| -------- | ------- |
| 1. Grow monolithic `live-api.contract.test.ts` | Rejected — hard to review; soft-skip mixes with canaries |
| **2. Domain suites under `test/integration/live/`** | **Accepted** — broad C without chaos; A/B split by file |
| 3. Same as 2 + CI matrix of parallel jobs | Rejected — overkill for weekly; more YAML / flake coordination |

## File layout

```text
test/integration/
  live-api.contract.test.ts   → DELETE (prefer delete over thin re-export)
  live/
    gate.ts                   → runLiveTests / describeLive
    client.ts                 → shared createBsuirClient({ timeout, retries, ... })
    fixtures.ts               → hardcoded urlId / departmentId + findWorkingGroup/Employee
    catalogs.live.test.ts
    schedule.live.test.ts     ← soft-skip if probe empty
    announcements.live.test.ts
    strict-and-helpers.live.test.ts  ← strict + helpers; soft-skip without schedule
```

### Shared helpers

| File | Responsibility |
| ---- | -------------- |
| `gate.ts` | Export `runLiveTests` (`process.env.BSUIR_LIVE_TESTS === "1"`) and `describeLive` (`describe` vs `describe.skip`) |
| `client.ts` | One shared client factory matching today’s live defaults (`timeoutMs: 15_000`, `retries: 2`, retry delay/jitter) |
| `fixtures.ts` | Hardcoded fixtures: employee `urlId: "s-nesterenkov"`, department id `20027` (same as today’s monolith) plus `findWorkingGroupNumber` / `findWorkingEmployeeUrlId` (probe first 50 catalog entries via `get*Raw`; continue on 404/503/Invalid JSON) |

### Wiring

- All suites import `describeLive` from `gate.ts` — no per-file gate duplication.
- `package.json`: `"test:live": "vitest run test/integration/live"`.
- `.github/workflows/live-contract.yml`: keep `npm run test:live` + `BSUIR_LIVE_TESTS: "1"` (path change is via script; cron unchanged).
- README / CONTRIBUTING: point at the live folder / script; no behavior change for how to run tests.

## Assertions (section 3 — locked)

### Catalogs — must pass

- Call `listAll` for all six modules: groups, employees, departments, faculties, specialities, auditories.
- Each result: `Array.isArray`, must **not** look like a raw Spring page (`not.toHaveProperty("content")`).
- Sample fields where present: group `id`/`name`, employee `id`/`urlId`, department `id` (same minimal DTO bar as today’s monolith).

### Schedule — soft-skip unless both working group **and** employee are found

When both probes succeed, assert for the found entities:

| Call | Expectation |
| ---- | ----------- |
| `getGroup` / `getEmployee` | Has `lessons` + `schedules` |
| `getGroupRaw` / `getEmployeeRaw` | Envelope with `schedules` object or `null` |
| `getGroupExams` / `getEmployeeExams` | `Array.isArray` |
| `getGroupFiltered` / `getEmployeeFiltered` with `{ source: "schedules" }` | `Array.isArray` |
| `get*BySubgroup(..., 1)` default | `Array.isArray` |
| `get*BySubgroupRaw(..., 1)` | `Array.isArray` |
| `get*BySubgroupEnvelope(..., 1)` | Envelope shape (`ScheduleResponse`) |
| `getCurrentWeek` | `number` |

Last-update (optional soft):

- Keep a soft deprecated check (eslint-disable with reason: testing soft-deprecated until removal).
- Employee last-update on known fixture may assert `lastUpdateDate` string.
- Group last-update errors tolerated (legacy IIS; six-digit groups often fail).

If either probe fails after scanning: `console.warn` once and soft-skip this suite **and** the entire `strict-and-helpers` suite. Do **not** fail the job solely for missing schedule entities.

### Announcements — must pass

- **Wave 1 multipage canary** (move from monolith): raw `fetch` of employee announcements envelope; optional `page`/`size` probe; SDK `byEmployee` length equals `totalElements` when captured.
- `byDepartment`: on `BsuirApiError` status **400** or **422**, treat as `[]` (current behavior); still expect `Array.isArray`.
- `treat404AsEmpty: false` on a known-empty / 404 id: **only if stably reproducible** on live IIS; otherwise **documented skip** with a comment explaining why (do not flake weekly).

### Strict + helpers — soft-skip without schedule (same probe gate as schedule suite)

Prefer `createBsuirClient.strict()` when available; otherwise `createBsuirClient({ validateResponses: true, ...same timeouts/retries })`.

| Check | Expectation |
| ----- | ----------- |
| Strict client | `groups.listAll()` and `schedule.getGroup(workingGroup)` do **not** throw on live payload |
| `getTodayLessons(normalizedGroupSchedule, new Date())` | `Array.isArray` (`FlattenedScheduleItem[]`) |
| `buildScheduleDays(normalizedGroupSchedule, { days: 7 })` | `Array.isArray` of length ≤ 7; each item has `dateKey` (and is a `ScheduleDay`) |

Soft-skip the **entire** suite when schedule probes fail (do not invent a second probe; do not run partial catalog-only strict here — catalogs suite already covers non-strict `listAll`).

### Explicit non-assertions

- Exact lesson / announcement counts (except SDK length vs `totalElements` canary).
- Specific lesson titles or announcement bodies.
- IIS response-time stability.

## Soft-skip policy (IIS instability)

```text
probe findWorkingGroup / findWorkingEmployee
  → per candidate: get*Raw
  → on 404 | 503 | Invalid JSON: continue
  → after ~50 with no success: undefined

if group && employee:
  run schedule + strict-and-helpers
else:
  console.warn(...)
  soft-skip schedule + strict-and-helpers entirely

catalogs + announcements: ALWAYS run / MUST pass
```

Rationale: schedule IIS flakiness must not hide catalog unwrap regressions or announcement pagination drift.

## Risks and mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Weekly longer / noisier (subgroup × group × employee) | Single subgroup `1`; short asserts; shared probe once per run |
| `treat404AsEmpty: false` unstable on live | Assert only if reproducible; else documented skip |
| Strict client fails on real IIS quirk | Treat as **signal** (goal A): fix SDK or consciously loosen assert — do not silence |
| Soft-skip masks prolonged schedule outage | Keep warn visible; catalogs/announcements remain fail-fast |

## Docs / release

- Patch changeset describing docs + live test expansion only (no API change).
- Update README live-test section and CONTRIBUTING one-liner if they name the old monolith path.
- Do not change weekly cron.

## Done criteria

1. `test/integration/live/` exists with the layout above; monolith deleted.
2. `npm run test:live` runs `vitest run test/integration/live`; workflow still uses that script with `BSUIR_LIVE_TESTS=1`.
3. README + CONTRIBUTING mention the updated live entrypoint.
4. Locally: `BSUIR_LIVE_TESTS=1 npm run test:live` green, **or** schedule soft-skipped with warn while catalogs + announcements pass.
5. `npm run check` green; no production behavior change.
6. Patch changeset added for docs/tests.

## Implementation notes (non-goals for this spec)

This document is the approved design only. Implementation plan and coding come after user review of this file. Do not implement from this spec until an implementation plan is written.
