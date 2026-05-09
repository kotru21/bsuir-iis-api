# Contributing to bsuir-iis-api

Thank you for your interest! Below is everything you need to get started.

## Development Setup

```bash
npm install
npm run build        # compile TypeScript
npm test             # run unit + integration tests
npm run check        # type-check + lint + format check
```

## Project Structure

```markdown
src/
  client/    — HTTP engine, error classes, types, signal merging
  modules/   — per-resource API modules (schedule, groups, employees…)
  types/     — public TypeScript types (schedule, common, etc.)
  utils/     — shared guards, date helpers, week parser
```

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Add or update tests for any logic you change.
3. Run `npm run check` — all checks must pass before submitting.
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
