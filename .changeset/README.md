# Changesets

Run `npx changeset` to create a new release note entry.

Then merge the generated `.changeset/*.md` file to `main`.
Release workflow will either:

- open/update a Release PR with version bumps; or
- publish to npm when the Release PR is merged.
