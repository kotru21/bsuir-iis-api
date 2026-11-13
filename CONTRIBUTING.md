# Contributing to bsuir-iis-api

Thank you for your interest! Below is everything you need to get started.

## Development Setup

```bash
npm install
npm run build        # compile TypeScript
npm test             # unit tests (live: BSUIR_LIVE_TESTS=1 npm run test:live → test/integration/live/)
npm run test:browser  # Chromium + WebKit runtime tests (see Browser Tests below)
npm run check        # lint + typecheck + unit tests
npm run check:full   # lint + typecheck + format:check + coverage (matches CI on Node 22+)
```

Development and the published runtime both require **Node.js 22.18+** (the floor matches `tsdown`; lint tooling and the build both rely on it). CI runs the full pipeline on Node 22, 24 (active LTS), and 26 (current, early-warning).

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

Browser tests live in `test/browser/` and run in real Chromium and WebKit (Safari's engine, the oldest in the supported baseline) via Vitest Browser Mode.

```bash
npx playwright install chromium webkit   # first-time setup
sudo npx playwright install-deps webkit  # Linux: system libraries WebKit needs
npm run test:browser
npm run test:browser -- --project chromium  # one engine only
```

They verify the native `fetch` call path and platform APIs (`AbortSignal.any`, `AbortSignal.timeout`, native `DOMException`) that the SDK relies on in browser apps. They are excluded from `npm test` and run separately in CI.

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

Once changesets reach `main`, the **Release** workflow opens (or updates) a `chore: release packages` PR that bumps the version and writes `CHANGELOG.md`. Merging that PR publishes to npm with provenance and creates the `vX.Y.Z` tag and GitHub release. The Release PR is opened with the workflow token, so CI does not run on it automatically; the release job runs the full check suite itself before publishing.

## Code Style

- TypeScript strict mode is enabled — no `any` without explicit justification.
- Prefer named exports over default exports.
- Keep functions small and single-purpose.
- Add JSDoc to all exported public API symbols (interfaces, types, classes, and functions).
- After changing public exports, run `npm run api:report` and confirm new symbols are not marked `@public (undocumented)`.
- Exported functions, classes, interfaces and types need a top-level JSDoc summary (oxlint `sdk-docs/require-export-jsdoc` on `src/**`), and `@param` names must match the parameters (`sdk-docs/check-param-names`).
- Exports in `src` need explicit types (`isolatedDeclarations`, checked by `npm run typecheck`): the published `.d.ts` is generated without type inference.
