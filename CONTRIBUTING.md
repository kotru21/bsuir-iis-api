# Contributing to bsuir-iis-api

Thank you for your interest! Below is everything you need to get started.

## Development Setup

```bash
npm install
npm run build        # compile TypeScript
npm test             # unit tests (live: BSUIR_LIVE_TESTS=1 npm run test:live → test/integration/live/)
npm run test:browser  # Chromium runtime tests (requires: npx playwright install chromium)
npm run check        # lint + typecheck + unit tests
npm run check:full   # lint + typecheck + format:check + coverage (matches CI)
```

Coverage thresholds are enforced by Vitest (`vitest.config.ts`: lines/functions/statements ≥ 85%, branches ≥ 80%). `check:full` runs `test:coverage`, so CI fails when coverage drops below those floors.

## Project Structure

```markdown
src/
client/ — HTTP engine, error classes, types, signal merging
modules/ — per-resource API modules (schedule HTTP + normalize; filter re-exported from helpers)
helpers/ — pure schedule filter, day/time helpers, and formatters
types/ — public TypeScript types (schedule, common, etc.)
utils/ — shared guards, date helpers, week parser, JSON freeze helpers
```

## Browser Tests

Browser tests live in `test/browser/` and run in real Chromium via Vitest Browser Mode.

```bash
npx playwright install chromium   # first-time setup
npm run test:browser
```

They verify platform APIs (`AbortSignal.any`, `AbortSignal.timeout`, native `DOMException`) that the SDK relies on in browser apps. They are excluded from `npm test` and run separately in CI.

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Add or update tests for any logic you change.
3. Run `npm run check:full` before submitting (or at minimum `npm run check`).
4. Run `npm test` — all tests must pass.

## Commits & Pull Requests

- Use clear, imperative commit messages: `fix: validate empty string in parseCurrentWeek`.
- One logical change per PR; split unrelated changes into separate PRs.
- Reference related issues in the PR description when applicable.

## Releases (Changesets)

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

If your PR includes a user-facing change (new feature, bug fix, breaking change), run:

```bash
npx changeset
```

Select the bump type (`patch` / `minor` / `major`), write a short description, and commit the generated `.changeset/*.md` file along with your changes.

> **Do not** manually edit `package.json` version or `CHANGELOG.md` — the release workflow handles that.

## Code Style

- TypeScript strict mode is enabled — no `any` without explicit justification.
- Prefer named exports over default exports.
- Keep functions small and single-purpose.
- Add JSDoc to all exported public API symbols.
