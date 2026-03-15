# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
This changelog is maintained manually and updated in release commits.

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
