# Quality Later items (Wave 4) — design

**Date:** 2026-07-11  
**Package:** `bsuir-iis-api` (from v1.0.1)  
**Status:** shipped (PR)  
**Parent:** `docs/superpowers/specs/2026-07-11-quality-improvements-design.md` (Later)

## Goal

Ship deferred Later items that are still worth doing after Waves 0–3:

| ID   | Work                                                       | Decision here                                     |
| ---- | ---------------------------------------------------------- | ------------------------------------------------- |
| P2-4 | Clarify `modules/schedule.ts` vs `helpers` export boundary | **do** — small internal cleanup                   |
| P3-1 | Coverage thresholds in Vitest + CI enforce                 | **verify** — already present; document            |
| P2-5 | Split large tests (`http.test.ts`, `schedule.test.ts`)     | **do** — navigation only                          |
| P3-2 | Public API surface trim / unused-export audit              | **audit only** — trim only if clear dead exports  |
| P3-3 | Deeper per-field schedule validation                       | **skip** — expensive; envelope + normalize enough |

Order: **P2-4 → P3-1 → P2-5 → P3-2 (conditional)**. Skip P3-3.

## Constraints

- Behavior-preserving; public package exports stay identical.
- No Don't items (D-1..D-6).
- Semver: **patch** if any package source ships; docs-only notes need no bump if nothing ships (this wave does ship refactors).

## P2-4 — export boundary

**Before:** `modules/schedule.ts` re-exported HTTP module factories _and_ pure helpers/formatters; `index.ts` imported helpers only via that module barrel.

**After:**

| Layer                    | Owns                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `modules/schedule*`      | Client schedule module + `filterLessons` / `normalizeSchedule` |
| `helpers/schedule*`      | Pure schedule day/time helpers                                 |
| `helpers/scheduleFormat` | Presentation formatters                                        |
| `src/index.ts`           | Re-exports each from its owning layer (public API unchanged)   |

## P3-1 — coverage thresholds

Already configured in `vitest.config.ts` (`lines`/`functions`/`statements` 85, `branches` 80). CI runs `npm run check:full` → `test:coverage`, so Vitest fails the job when thresholds are missed. Wave 4 only documents this in CONTRIBUTING and marks the backlog item done.

## P2-5 — test splits

| Before                          | After (scenario files)                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| `test/client/http.test.ts`      | Shared config helper + scenario suites under `test/client/http/` |
| `test/modules/schedule.test.ts` | Shared fixture + scenario suites under `test/modules/`           |

No assertion/behavior changes.

## P3-2 — API trim

Scanned `etc/bsuir-iis-api.api.md` against README public surface and examples.

- Every root function export is documented (helpers + formatters + normalize/filter).
- Domain types are either documented or appear in public return/param positions.
- `ae-forgotten-export` on `create*Module` factories is intentional (`ReturnType<>` only; not part of the public package surface).

**Decision:** no trims — YAGNI. Revisit only if a future consumer-facing major needs a smaller surface.

## Out of scope

- P3-3 deeper schedule field validation
- Don't items D-1..D-6
- Public API renames
