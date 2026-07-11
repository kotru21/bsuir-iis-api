# Announcements multi-page fetching — mini-spec (Wave 1 / P0-1)

**Date:** 2026-07-11  
**Package:** `bsuir-iis-api` (post 0.13.2)  
**Parent:** `docs/superpowers/specs/2026-07-11-quality-improvements-design.md`  
**Status:** approved (API semantics locked in Wave 1 kickoff)

## Problem

IIS serves announcements as a Spring Data page. Default page size is **20**. Today the SDK unwraps only the first page’s `content`, so callers silently miss announcements beyond page 0 when `totalPages > 1`.

## Live contract (probed 2026-07-11)

| Observation      | Evidence                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| Envelope         | `{ content, pageable, totalElements, totalPages, last, size, number, ... }` |
| Default size     | `pageSize` / `size` = **20**                                                |
| Query params     | **`page`** (0-based) and **`size`** — Spring Data defaults                  |
| `pageSize` query | **Ignored** by IIS (still returns default size 20)                          |
| Example          | `s-nesterenkov`: 10 items → 1 page at default; 2 pages when `size=5`        |

## Decision (locked)

| Topic               | Choice                                                              | Why                                                            |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Default behavior    | **Always fetch all pages** and return concatenated `Announcement[]` | Closes silent data-loss P0; callers already expect a full list |
| Public options      | **No new opts** (`fetchAllPages` / `maxPages` YAGNI)                | Constant safety cap is enough                                  |
| Semver              | **patch**                                                           | Behavior bugfix; return type unchanged                         |
| Unwrap              | Reuse `unwrapSpringPageContent`                                     | Wave 0 foundation                                              |
| Empty 404           | Keep `treat404AsEmpty` unchanged (first request only)               | Existing contract                                              |
| Safety cap          | **`MAX_ANNOUNCEMENT_PAGES = 50`**                                   | Bound latency / IIS load                                       |
| Cap exceeded        | Throw **`BsuirConfigurationError`** with a clear message            | Typed, already exported; no new public error class             |
| Subsequent-page 404 | **Do not** map to `[]` — rethrow                                    | First page succeeded; mid-pagination 404 is exceptional        |

## Behavior

1. Request page 0 with existing query (`url-id` / `id`) — no `page`/`size` unless continuing.
2. If payload is a **plain array** → return it (legacy).
3. If payload is a Spring page:
   - Append `content` (via `unwrapSpringPageContent`).
   - If `totalPages` is a number and `totalPages > MAX_ANNOUNCEMENT_PAGES` → throw immediately.
   - While more pages remain (`last === false` or next page index `< totalPages`):
     - Request with same entity query + `page: n` + `size: <firstPageSize>` where `firstPageSize` comes from `pageable.pageSize` ?? `size` ?? `20`.
     - Validate (when `validateResponses`) and append each page’s `content`.
     - If fetched page count would exceed the cap → throw.
4. Return the concatenated array.

## Non-goals

- Exposing `page` / `size` to callers
- Multi-page for catalog `listAll` (separate backlog item if needed)
- Changing `treat404AsEmpty` semantics
- Opt-in first-page-only mode

## Docs / release

- Update README pagination note (fetch-all + 50-page cap + error).
- Patch changeset.
- Unit tests: multi-page sequence, single page, plain array, cap exceeded, `treat404AsEmpty` unchanged.
- Live canary: assert IIS `page`/`size` pagination; SDK `byEmployee` length equals `totalElements` from the default envelope when present.

## Done criteria

- `npm run check:full` green
- Live tests with `BSUIR_LIVE_TESTS=1` green
- Patch published after merge
