# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
This changelog is maintained manually and updated in release commits.

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
