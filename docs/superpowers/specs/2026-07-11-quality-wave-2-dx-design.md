# Quality Wave 2 (DX major) — design

**Date:** 2026-07-11  
**Package:** `bsuir-iis-api` (from v0.13.3)  
**Status:** approved (locked decisions from quality-improvements design + Wave 2 brief)  
**Parent:** `docs/superpowers/specs/2026-07-11-quality-improvements-design.md` (Wave 2)

## Goal

Ship Wave 2 DX work in one **major** release:

| ID   | Work                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------- |
| P3-4 | Migration-note template for majors (README / docs)                                              |
| P1-1 | Replace subgroup `raw` / `rawEnvelope` overload matrix with explicit methods; remove flags      |
| P1-2 | Soft-deprecate legacy last-update via JSDoc `@deprecated` + README (behavior unchanged)         |
| P1-3 | Improve `validateResponses` DX (docs / examples / optional strict factory); **no** default flip |

## Constraints

- **C (P1-1):** Single major — add explicit methods and remove `raw` / `rawEnvelope` from `get*BySubgroup` in the same release. Migration note required.
- Keep group/employee symmetry.
- Align subgroup naming with existing `getGroup` / `getGroupRaw` pattern; rename oddly named `getGroupEnvelope` / `getEmployeeEnvelope` to `get*BySubgroupEnvelope`.
- P1-3: do **not** flip `validateResponses` default to `true`. Prefer README + JSDoc; add `createBsuirClient.strict()` only if cheap.
- Do not start Wave 3 (scheduleApi dedup / file splits).

## Public API rename map (P1-1)

### Subgroup helpers — old → new

| Old call site                                                   | New call site                                    | Return type               |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------- |
| `getGroupBySubgroup(group, subgroup)`                           | unchanged                                        | `FlattenedScheduleItem[]` |
| `getGroupBySubgroup(group, subgroup, { raw: true })`            | `getGroupBySubgroupRaw(group, subgroup)`         | `ScheduleItem[]`          |
| `getGroupBySubgroup(group, subgroup, { rawEnvelope: true })`    | `getGroupBySubgroupEnvelope(group, subgroup)`    | `ScheduleResponse`        |
| `getEmployeeBySubgroup(urlId, subgroup)`                        | unchanged                                        | `FlattenedScheduleItem[]` |
| `getEmployeeBySubgroup(urlId, subgroup, { raw: true })`         | `getEmployeeBySubgroupRaw(urlId, subgroup)`      | `ScheduleItem[]`          |
| `getEmployeeBySubgroup(urlId, subgroup, { rawEnvelope: true })` | `getEmployeeBySubgroupEnvelope(urlId, subgroup)` | `ScheduleResponse`        |

`ReadOptions` (`signal`, `cache`) remain on all variants. Flags `raw` / `rawEnvelope` are **removed** from subgroup methods (not deprecated).

### Explicit envelope helpers already shipped — rename for consistency

| Old                                              | New                                  | Notes                           |
| ------------------------------------------------ | ------------------------------------ | ------------------------------- |
| `getGroupEnvelope(group, subgroup, options?)`    | `getGroupBySubgroupEnvelope(...)`    | Same behavior; old name removed |
| `getEmployeeEnvelope(urlId, subgroup, options?)` | `getEmployeeBySubgroupEnvelope(...)` | Same behavior; old name removed |

Unchanged (non-subgroup):

- `getGroup` / `getGroupRaw`
- `getEmployee` / `getEmployeeRaw`

### Target `ScheduleModule` surface (subgroup-related)

```ts
getGroupBySubgroup(groupNumber, subgroup, options?: ReadOptions): Promise<FlattenedScheduleItem[]>;
getGroupBySubgroupRaw(groupNumber, subgroup, options?: ReadOptions): Promise<ScheduleItem[]>;
getGroupBySubgroupEnvelope(groupNumber, subgroup, options?: ReadOptions): Promise<ScheduleResponse>;

getEmployeeBySubgroup(urlId, subgroup, options?: ReadOptions): Promise<FlattenedScheduleItem[]>;
getEmployeeBySubgroupRaw(urlId, subgroup, options?: ReadOptions): Promise<ScheduleItem[]>;
getEmployeeBySubgroupEnvelope(urlId, subgroup, options?: ReadOptions): Promise<ScheduleResponse>;
```

No overload matrix.

## P1-2 — last-update soft deprecation

- Add `@deprecated` JSDoc on `getLastUpdateByGroup` and `getLastUpdateByEmployee` pointing at IIS legacy status and recommending not to rely on them for freshness (especially six-digit groups).
- Strengthen README “Last update (legacy IIS)” to say SDK marks these deprecated; removal planned in a later major.
- Runtime behavior unchanged.

## P1-3 — `validateResponses` DX

- Expand README: when to enable, what is checked, that default stays `false`, and that normalized schedule still has a minimal envelope guard.
- Tighten JSDoc on `BsuirClientOptions.validateResponses`.
- Add cheap factory: `createBsuirClient.strict(options?)` ≡ `createBsuirClient({ ...options, validateResponses: true })` (explicit `validateResponses` in options still wins if caller passes it — prefer spread so caller override works: `{ validateResponses: true, ...options }` would let caller set false; use `{ ...options, validateResponses: true }` so strict always forces true).
- **Do not** change default.

## P3-4 — migration-note template

Add a short reusable section under README “Release checklist” (or `docs/migration-notes.md` linked from README) describing:

1. What broke / was removed
2. Old → new mapping table
3. Codemod-style search hints (optional one-liners)

Wave 2 uses that template for the P1-1 migration note (in README + changeset body).

## Semver / release

- Changeset: `"bsuir-iis-api": major`
- With Changesets on 0.x, expect **0.14.0** (pre-1.0 major → minor bump) unless config says otherwise; publish via normal GH Actions after `changeset version` on `main`.

## Testing

- Unit: update `scheduleApi.raw.test.ts`, `scheduleApi.newApi.test.ts`, `schedule.test.ts` to new method names; drop precedence / flag overload tests.
- Type tests: replace `test/types/scheduleApi.overloads.ts` with checks that new methods exist and default `get*BySubgroup` only accepts `ReadOptions` (no `raw` / `rawEnvelope`).
- `npm run check:full` + `api:report`; live tests soft-skip on 503.

## Out of scope

- Wave 3 dedup of group/employee (`P2-3`)
- Removing last-update methods
- Defaulting `validateResponses` to `true`
- Keeping `getGroupEnvelope` / `getEmployeeEnvelope` aliases
