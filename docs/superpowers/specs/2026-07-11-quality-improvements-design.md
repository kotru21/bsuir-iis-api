# Quality improvements & refactoring backlog — design

**Date:** 2026-07-11  
**Package:** `bsuir-iis-api` (v0.13.x)  
**Status:** Waves 0–3 shipped (package **1.0.1**). Later items: see `2026-07-11-quality-later-wave4-design.md`.

## Goal

Full audit of quality improvements and refactoring for the SDK, with an explicit **do / later / don't** decision per item. Deliver a prioritized, wave-ordered backlog (impact × effort), not a single big-bang rewrite.

## Constraints (from brainstorm)

- Mix of axes: internal refactor, consumer DX, reliability — prioritized with effort/impact.
- Small breaking changes are acceptable if shipped as **semver major** with clear changelog / migration notes (no large API redesign).
- No pre-identified consumer pain list — backlog derived from code, README, and CHANGELOG.
- Horizon: **full audit** (everything notable + defer / don't).
- Prefer one logical change ≈ one PR (~400 lines max per repo convention).

## Strategy

**Impact × effort matrix in waves** (approach 3), with layer-aware ordering inside waves: land shared foundations and contract fixes before DX majors; land internal file splits after the public schedule surface is simplified so copy-paste is not refactored twice.

### Item tags

| Field    | Values                                                |
| -------- | ----------------------------------------------------- |
| Axis     | `reliability` / `dx` / `refactor` / `tooling`         |
| Effort   | S (≤1 PR) / M (1–2 PR) / L (multi-PR / major surface) |
| Impact   | H / M / L                                             |
| Breaking | yes / no / soft-deprecation                           |
| Decision | **do** / **later** / **don't**                        |

### Wave priorities

- **P0** — contract gaps / silent consumer surprises (reliability)
- **P1** — small DX + acceptable major
- **P2** — internal splits that cheapen further work
- **P3** — nice-to-have
- **Don't** — YAGNI or cost ≫ benefit

---

## Catalog

### P0 — reliability / contract

| ID   | Item                                                                                        | Axis        | E   | I   | Break  | Decision | Why                                                             |
| ---- | ------------------------------------------------------------------------------------------- | ----------- | --- | --- | ------ | -------- | --------------------------------------------------------------- |
| P0-1 | Announcements multi-page fetching (today: first page only, `pageSize: 20`)                  | reliability | M   | H   | soft\* | **do**   | Silent data loss when >20 announcements                         |
| P0-2 | Live-contract coverage for announcements envelope + pagination shape                        | reliability | S   | H   | no     | **do**   | Catch IIS drift before users                                    |
| P0-3 | Probe catalog `listAll` endpoints for Spring page envelopes (same pattern as announcements) | reliability | S   | H   | no     | **do**   | `assertArrayResponse` only helps when `validateResponses: true` |

\*Exact default for multi-page (always fetch-all vs opt-in) is deferred to a Wave 1 mini-spec; this audit only requires closing the gap.

### P1 — DX / small breaking

| ID   | Item                                                                                                                                        | Axis        | E   | I   | Break    | Decision | Why                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --- | -------- | -------- | --------------------------------------------------------------------------- |
| P1-1 | Simplify subgroup API: replace `raw` / `rawEnvelope` overload matrix with explicit methods (mirror `getGroup` / `getGroupRaw`)              | dx          | M   | H   | yes      | **do**   | `scheduleApi.ts` ~445 lines; group/employee duplication; clearer call sites |
| P1-2 | Deprecate legacy last-update (`getLastUpdateByGroup` / `getLastUpdateByEmployee`) via JSDoc `@deprecated` + README; remove in a later major | dx          | S   | M   | soft→yes | **do**   | Already documented as legacy; six-digit groups can fail upstream            |
| P1-3 | Improve `validateResponses` DX (docs, examples, optional strict factory). **Do not** flip default to `true` without a dedicated major       | dx          | S   | M   | no       | **do**   | Opt-in stays; DX can improve without silent breakage                        |
| P1-4 | Shared Spring `{ content }` unwrap helper (announcements → reuse if P0-3 confirms)                                                          | refactor+dx | S   | M   | no       | **do**   | Removes normalize/assert copy-paste                                         |

### P2 — internal refactor

| ID   | Item                                                                                             | Axis     | E   | I   | Break | Decision        | Why                                                              |
| ---- | ------------------------------------------------------------------------------------------------ | -------- | --- | --- | ----- | --------------- | ---------------------------------------------------------------- |
| P2-1 | Split `requestJson.ts` (~385): cache key / private headers / body serialize / perform+retry loop | refactor | M   | M   | no    | **do**          | Multiple responsibilities; tests already partly split by concern |
| P2-2 | Split `helpers/schedule.ts` (~489): date keys / current-next / `buildScheduleDays`               | refactor | M   | M   | no    | **do**          | Largest source file; hard to review                              |
| P2-3 | Dedup group/employee in `scheduleApi` via shared factory after P1-1                              | refactor | M   | M   | no    | **do**          | Near-duplicate method pairs                                      |
| P2-4 | Clarify `modules/schedule.ts` vs `helpers` export boundary                                       | refactor | S   | L   | no    | **do** (Wave 4) | Cosmetic; not blocking; shipped in Later wave                    |
| P2-5 | Split large tests (`http.test.ts` ~559, `schedule.test.ts` ~392) by scenario                     | tooling  | M   | L   | no    | **do** (Wave 4) | Navigation only                                                  |

### P3 — nice-to-have

| ID   | Item                                                        | Axis        | E   | I   | Break | Decision              | Why                                                         |
| ---- | ----------------------------------------------------------- | ----------- | --- | --- | ----- | --------------------- | ----------------------------------------------------------- |
| P3-1 | Coverage thresholds in Vitest + CI enforce                  | tooling     | S   | L   | no    | **done** (pre-Wave 4) | Thresholds already in Vitest; CI via `check:full`           |
| P3-2 | Public API surface trim / api-extractor unused-export audit | dx          | S   | L   | maybe | **skip** (Wave 4)     | Usage scan found no clear dead exports; YAGNI               |
| P3-3 | Deeper per-field schedule validation (beyond envelope)      | reliability | L   | M   | no    | **skip** (Wave 4)     | Expensive; envelope + normalize already protect crash paths |
| P3-4 | Migration-guide template for majors                         | tooling     | S   | M   | no    | **do**                | Cheap; required for P1-1                                    |

### Don't

| ID  | Item                                                                  | Why not                                                 |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| D-1 | Default `validateResponses: true` without dedicated major + migration | Breaks clients on quirky IIS payloads                   |
| D-2 | Write/mutate IIS endpoints                                            | SDK is read-oriented; YAGNI                             |
| D-3 | Replace hand-written validators with Zod/io-ts                        | Heavy dependency/bundle for current assert depth        |
| D-4 | Big client redesign (DI container, middleware pipeline)               | Overkill for library size                               |
| D-5 | Remove raw schedule helpers                                           | Needed by advanced consumers; explicit names are enough |
| D-6 | CJS dual package                                                      | ESM-only is intentional (`engines.node >= 20`)          |

---

## Wave order and dependencies

```text
Wave 0 (foundation, non-breaking)
  P1-4  Spring page unwrap helper
  P0-3  Catalog list envelope probe (+ unit/live as needed)
  P0-2  Live-contract: announcements envelope/pagination
       │
       ▼
Wave 1 (close silent data loss)
  P0-1  Announcements multi-page  ← uses P1-4
       │
       ▼
Wave 2 (DX major, small breaking)
  P3-4  Migration-note template (README/docs)
  P1-1  Explicit subgroup methods; remove/deprecate overload flags
  P1-2  @deprecated last-update (+ README)
  P1-3  validateResponses DX (no default flip)
       │
       ▼
Wave 3 (internal, cheaper maintenance)
  P2-3  Dedup scheduleApi group/employee  ← after P1-1
  P2-1  Split requestJson
  P2-2  Split helpers/schedule
       │
       ▼
Later (when it hurts)
  P2-4, P2-5, P3-1, P3-2, P3-3
```

### Sequencing rules

1. Shared unwrap + catalog probe first — cheap insurance against the next Spring-style drift.
2. Multi-page announcements before large schedule DX — do not mix major surface changes with pagination semantics in one release.
3. Subgroup API simplify in **one major**: add explicit methods and remove `raw` / `rawEnvelope` flags from `get*BySubgroup` in the same release (aligned with constraint C — small, documented breaking). Migration note required. No multi-release deprecation window unless a later decision overrides this.
4. File splits only after schedule public surface is simplified — avoid refactoring duplicated overloads twice.
5. Do not mix Later/Don't work into Wave 0–3 PRs.

**PR sizing:** one catalog ID ≈ one PR (exception: P1-1 may be two PRs — add explicit methods, then remove deprecated flags).

---

## Testing, done criteria, risks

### Wave done criteria

- `npm run check:full` green; browser-sensitive changes also run `npm run test:browser`
- Changeset with correct bump (patch / minor / major)
- README and `etc/bsuir-iis-api.api.md` (via `api:report`) match the public API
- Breaking changes: short migration note (removed API → replacement)

### Test strategy by work type

| Type                       | Minimum                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Contract / pagination (P0) | Unit tests for unwrap + multi-page mocks; live-contract opt-in / weekly CI for real shapes |
| DX breaking (P1-1)         | Type tests for new methods; keep tests for old flags until removal; public-api smoke       |
| Internal split (P2)        | Existing tests, behavior-preserving; no feature changes in the same PR                     |
| Deprecation (P1-2)         | JSDoc `@deprecated` + README; behavior unchanged until a dedicated major removal           |

### Risks

1. **P0-1 pagination default** — silent fetch-all increases latency and IIS load. Mitigation: decide semantics in a Wave 1 mini-spec before coding (first-page default + opt-in fetch-all vs always-all).
2. **P1-1 breaking** — callers using `raw` / `rawEnvelope` on subgroup methods. Mitigation: single major that swaps to explicit methods + migration note mapping old flags → new method names.
3. **P2 splits** — false regressions from moves. Mitigation: behavior-only PRs; never mix with P0/P1.
4. **P0-3 false alarm** — catalogs may still be plain arrays. Mitigation: probe/observe first; add unwrap only if live or fixtures prove envelopes.

### Out of scope for this design

- Implementing any wave
- Exact multi-page public API (Wave 1 mini-spec)
- Expanding Don't items “just in case”

---

## Success for this design doc

Readers can pick the next implementation slice (Wave 0 → …) without re-litigating priorities, and know what is explicitly deferred or rejected.
