# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-03-15

### Changed

- Hardened timeout test logic to avoid CI race conditions with aborted signals.
- Updated release workflow to support manual dispatch and OIDC trusted publishing.
- Normalized `repository.url` in `package.json` for npm metadata compliance.

## [0.1.0] - 2026-03-15

### Added

- Initial ESM-only TypeScript SDK implementation.
- Typed modules for schedules, catalogs, announcements, current week and last update.
- Retry/timeout-enabled HTTP client with typed errors.
- Unit and smoke tests with Vitest.
- CI, release and npm publishing scaffolding.
