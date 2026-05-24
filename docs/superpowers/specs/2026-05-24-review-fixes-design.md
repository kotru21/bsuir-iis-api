# Review Fixes Design (2026-05-24)

Status: Approved

## Context
This design implements all items from the recent code review, with breaking changes allowed. The work is ordered by best practice: correctness/behavior first, then public API/architecture, then refactor/cleanup, then tests/docs/changeset.

## Goals
- Fix correctness and behavior issues (errors, retry, cache/dedup, date handling).
- Simplify and make schedule API explicit (no overload matrix).
- Reduce duplication and align utilities and validators.
- Align tests, documentation, and API report with the new behavior.

## Non-goals
- Preserve backwards compatibility (breaking changes are allowed).
- Add new features beyond resolving the review items.
- Over-optimize beyond correctness and clarity.

## Phase 1: Correctness and Behavior
1) Error and hook consistency
- Always call `onError` for `BsuirResponsePayloadTooLargeError`.
- Ensure non-OK responses do not lose the HTTP context even if JSON parsing fails.
- Preserve the last error as `cause` in the retry loop termination error.

2) Retry and Retry-After parsing
- Replace `Date.parse` for HTTP-date with a strict parser for IMF-fixdate, RFC 850, and asctime.
- Make `getRetryDelayMs` reflect the "do not retry" decision or remove the helper and use `getRetryDecision` directly.

3) Cache and dedup behavior
- Split URL ordering from cache key ordering: keep query order in the URL, sort only for the cache/dedup key.
- Make `setCache` signature unambiguous (no `undefined` return). Caller controls whether caching is enabled.
- Avoid mutating `Map` while iterating by collecting keys to delete.
- Disable in-flight dedup when a per-request `signal` is provided to avoid cross-cancellation.

4) Schedule helpers correctness
- Add `subgroup` validation in `filterLessons`.
- Add explicit week-cycle override for date-based helpers to avoid brittle inference.
- Provide explicit timezone semantics (documented default and option to override).
- Normalize and expose `nextSchedules` with a distinct source label and helper support.
- Replace mutable `Date` in `buildScheduleDays` output with an immutable representation (ISO date string and epoch day key).

5) URL and request body
- Stop sorting query params in `buildUrl`.
- Avoid mutating caller-provided headers in `serializeRequestBody` (return new headers or set only on a cloned instance).

## Phase 2: Public API and Architecture
1) Schedule API redesign (breaking)
- Remove `defaultRaw` from client options.
- Replace overloads with explicit methods:
  - `getGroup`, `getGroupRaw`, `getGroupEnvelope`
  - `getEmployee`, `getEmployeeRaw`, `getEmployeeEnvelope`
  - subgroup equivalents with explicit return types
- Eliminate `ScheduleModule` overload matrix and `as` casts.

2) Client types
- Remove `InternalClientConfig` generic (no longer needed after `defaultRaw` removal).
- Replace `ReturnType<typeof createXModule>` in `BsuirClientShape` with explicit, stable interfaces.

3) Validation consistency
- Make `validateResponses` behavior consistent across all modules (either always gated by flag or always validated with a documented override).

## Phase 3: Refactor and Cleanup
- Split `requestJson` into focused layers: build request, transport, retry, parse, cache/dedup, hooks.
- Extract duplicated utilities:
  - `deepFreezeJson`
  - `lessonAuditories`
  - `parseDdMmYyyy` (+ parts)
- Replace `mergeSignals` cleanup Symbol mutation with a `WeakMap`.
- Remove `fixErrorPrototype` if ES2022 target makes it unnecessary.
- Replace `toSorted` usage with `Array.prototype.sort` for broader runtime compatibility.
- Replace Unicode escape literals in schedule format helpers with plain UTF-8 text (file already contains Cyrillic).
- Tighten `parseCurrentWeek` to a strict, documented payload shape (no deep recursion).

## Phase 4: Tests, Docs, Changeset
- Update tests to the new schedule API methods and helper outputs.
- Add tests for retry parsing, error hooks on payload-too-large, and new cache/dedup semantics.
- Update README and API report to match new API and behavior.
- Add a changeset for a major release.

## Risks and Mitigations
- Breaking API: mitigated by clear docs, explicit method names, and a major version bump.
- Behavior shifts in caching/dedup: mitigated by tests and docs for signals and cache keys.
- Timezone and week-cycle behavior: mitigated by explicit options and documentation.
