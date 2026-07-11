# Quality Wave 3 (internal refactor) — design

**Date:** 2026-07-11  
**Package:** `bsuir-iis-api` (from v1.0.0)  
**Status:** approved (locked from quality-improvements design Wave 3)  
**Parent:** `docs/superpowers/specs/2026-07-11-quality-improvements-design.md` (Wave 3)

## Goal

Ship Wave 3 internal, behavior-preserving refactors only:

| ID   | Work                                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| P2-3 | Dedup group/employee method pairs in `scheduleApi` via a shared subject factory (after P1-1) |
| P2-1 | Split `requestJson.ts` (~417): cache key / private headers / body serialize / perform+retry  |
| P2-2 | Split `helpers/schedule.ts` (~525): date keys / current-next / `buildScheduleDays`           |

Order: **P2-3 → P2-1 → P2-2**. No feature changes, no public API renames, no Later/Don't items (P2-4, P2-5, P3-\*).

## Constraints

- Behavior-preserving: existing unit/browser/live tests must stay green without assertion changes (imports may move).
- Public exports (`ScheduleModule` method names, helpers from package root / `modules/schedule`, `InvalidLessonTimeHook`) stay identical.
- Prefer thin barrels (`helpers/schedule.ts`, `client/http.ts`) so call sites outside the split keep working.
- One logical change ≈ one commit; one PR for the wave (or 1–3 PRs if preferred).
- Semver: **patch** changeset (refactor ships in package source; no consumer-facing behavior change).

## File map — before / after

### P2-3 — `scheduleApi` subject factory

| Before                       | After                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| `src/modules/scheduleApi.ts` | Thin module: fetch raw/normalized + wire factory results to interface |
| _(none)_                     | `src/modules/scheduleApiSubject.ts` — shared group/employee helpers   |

Factory owns duplicated pairs:

- `get*Filtered` / `get*Exams`
- `get*BySubgroup` / `get*BySubgroupRaw` / `get*BySubgroupEnvelope`

Still subject-specific (not in factory): `getGroup` / `getEmployee` / `get*Raw` (different endpoints/guards), `getCurrentWeek`, last-update helpers, `ScheduleModule` interface.

### P2-1 — `requestJson` split

| Before                           | After                                                      |
| -------------------------------- | ---------------------------------------------------------- |
| `src/client/http/requestJson.ts` | Orchestrator: cache/dedup flags + `requestJson` entrypoint |
| _(inline)_                       | `src/client/http/requestCacheKey.ts` — allowlist + key     |
| _(inline)_                       | `src/client/http/privateHeaders.ts` — denylist + detect    |
| _(inline)_                       | `src/client/http/serializeBody.ts` — `BodyInit` / JSON     |
| _(inline)_                       | `src/client/http/performRequest.ts` — retry loop + hooks   |

`src/client/http.ts` continues to export only `requestJson`.

### P2-2 — `helpers/schedule` split

| Before                    | After                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/helpers/schedule.ts` | Barrel re-exporting public helpers + `InvalidLessonTimeHook`                                                                         |
| _(inline)_                | `src/helpers/scheduleDateKeys.ts` — date keys, ordinals, weekday, `toDateOrThrow`, range helpers (shared primitives)                 |
| _(inline)_                | `src/helpers/scheduleCurrentNext.ts` — time parse, `sortLessonsByTime`, `getCurrentLesson`, `getNextLesson`, `InvalidLessonTimeHook` |
| _(inline)_                | `src/helpers/scheduleBuildDays.ts` — `getLessonsForDate` / today / tomorrow / week / `groupLessonsByDay` + `buildScheduleDays`       |

Date-matching helpers live with `buildScheduleDays` to avoid a cycle (`getLessonsForDate` needs `sortLessonsByTime`; current-next needs `toDateOrThrow`).

`src/modules/schedule.ts` and `src/index.ts` keep importing from `helpers/schedule` (barrel).

## Semver / release

- Changeset: `"bsuir-iis-api": patch`
- Expect **1.0.1** after `changeset version` on `main`.

## Testing

- Existing tests only; no new behavior tests required.
- After each commit: targeted vitest suites (scheduleApi / requestJson / scheduleHelpers).
- Before PR: `npm run check:full` + `npm run api:report:check` (public API report must be unchanged).

## Out of scope

- P2-4 (`modules/schedule` vs helpers export boundary)
- P2-5 (splitting large tests)
- P3-\* coverage / api-surface trim / deeper validation
- Any schedule or HTTP feature changes
