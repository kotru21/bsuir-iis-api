# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
This changelog is maintained manually and updated in release commits.

## [Unreleased]

## [0.2.8] - 2026-03-16

### Changed (0.2.8)

- Hardened error handling for malformed inputs and partial schedule payloads.
- Extended error-focused tests with payload assertions for API/network/timeout error fields.
- Expanded README error handling docs with retry/abort semantics and validation constraints.

## [0.2.7] - 2026-03-16

### Added (0.2.7)

- Added `npm run lint:fix` for convenient local autofix flow.

### Changed (0.2.7)

- Reworked ESLint flat config to use typed `typescript-eslint` presets:
  `recommendedTypeChecked`, `strictTypeChecked`, and `stylisticTypeChecked`.
- Switched ESLint typed linting to `parserOptions.projectService` with `tsconfigRootDir`.
- Introduced explicit lint zones for `src` and `test`/`vitest` with targeted test overrides.
- Added `linterOptions.reportUnusedDisableDirectives` and normalized flat-config ignore patterns.
- Updated development docs with lint workflow and strict lint profile notes.

## [0.2.6] - 2026-03-16

### Added

- Added opt-in live contract tests (`test/integration/live-api.contract.test.ts`) for key
  BSUIR IIS read-only endpoints (catalogs, schedules, announcements, current week, last update).
- Added `npm run test:live` script for explicit execution of live contract tests.
- Added manual CI path (`workflow_dispatch`) with a dedicated `live-contract` job.

### Changed

- Strengthened input validation: `groupNumber` now accepts only digits and `urlId` is validated as slug
  (`letters/digits/hyphen`).
- Made cycle-week methods robust to method destructuring by removing `this`-dependent calls.
- Encoded employee schedule path parameter (`urlId`) with `encodeURIComponent`.
- Improved abort error detection to support non-DOMException abort shapes.
- Expanded unit and module tests with regression coverage for strict validation, destructured calls,
  and abort error detection.
- Updated README with validation rules and live test execution instructions.

## [0.2.5] - 2026-03-16

### Fixed (0.2.5)

- Fixed current week handling in `schedule.getCurrentWeek()` and `currentWeek.get()` by normalizing
  non-JSON payloads from `/schedule/current-week` (for example plain-text `1\n`).
- Added regression tests for plain-text current week responses in schedule/meta modules.

### Changed (0.2.5)

- Updated README semester week notes to document payload normalization behavior.

## [0.2.4] - 2026-03-15

### Changed (0.2.4)

- Aligned `ScheduleItem` contract with real API payloads by allowing nullable
  `weekNumber` and `lessonTypeAbbrev`.
- Hardened schedule filtering against nullable lesson fields to avoid runtime errors.
- Expanded schedule tests for nullable `weekNumber` / `lessonTypeAbbrev` cases.
- Updated README raw-mode notes to document nullable lesson fields.

## [0.2.3] - 2026-03-15

### Changed (0.2.3)

- Updated CI workflow actions to latest major versions (`actions/checkout@v6`, `actions/setup-node@v6`).
- Expanded tests for cycle-week behavior in schedule/meta modules.
- Added dedicated `createBsuirClient` tests for custom fetch and missing global fetch scenarios.

## [0.2.2] - 2026-03-15

### Added (0.2.2)

- Added cycle week support with `toCycleWeek()` helper and
  `schedule.getCurrentCycleWeek()` / `currentWeek.getCycle()` methods.
- Added explicit docs clarifying semester week vs cycle week behavior and aliases.

### Changed (0.2.2)

- Schedule API raw types now allow `schedules: null` from upstream payload.
- Normalized schedule responses now guarantee `schedules` is always an object.

## [0.2.1] - 2026-03-15

### Changed (0.2.1)

- Updated outdated tooling dependencies to latest major versions:
  `eslint`, `@eslint/js`, `vitest`, `@vitest/coverage-v8`, `globals`, `@types/node`.
- Revalidated quality gates after upgrades (`check:full`, `build`, `release:dry`).

## [0.2.0] - 2026-03-15

### Added (0.2.0)

- Schedule filtering helpers: `getGroupFiltered()` and `getEmployeeFiltered()`.
- Additional schedule DX helpers: exams-only and subgroup shortcuts.
- Expanded normalized schedule payload with `lessonsByDay`, `scheduleLessons`, and `examLessons`.
- Retry enhancements with exponential backoff, jitter, and `Retry-After` support.

## [0.1.1] - 2026-03-15

### Changed (0.1.1)

- Hardened timeout test logic to avoid CI race conditions with aborted signals.
- Updated release workflow to support manual dispatch and OIDC trusted publishing.
- Normalized `repository.url` in `package.json` for npm metadata compliance.

## [0.1.0] - 2026-03-15

### Added (0.1.0)

- Initial ESM-only TypeScript SDK implementation.
- Typed modules for schedules, catalogs, announcements, current week and last update.
- Retry/timeout-enabled HTTP client with typed errors.
- Unit and smoke tests with Vitest.
- CI, release and npm publishing scaffolding.
