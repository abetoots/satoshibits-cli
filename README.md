# `satoshibits-cli`

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier) [![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/) [![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/wtchnm/Vitamin/blob/main/LICENSE)

This is a monorepo for managing and publishing CLI packages responsible for generating templates.

## Getting started

You can find each CLI's instructions in their respective READMEs.

## Working within the monorepo

### Changes that should trigger a package publish

1. Make your changes and group them to the relevant package.
2. `pnpm run commit:publish` — this runs `changeset`, stages the changeset file, and opens commitizen.
3. Open a PR to `main`. CI runs build, lint, typecheck, and tests automatically.
4. On merge, the release workflow creates a **"Version Packages" PR** that bumps versions and updates changelogs.
5. When the Version Packages PR is merged, changed packages are published to npm.

### Changes that don't require publishing

1. Make your changes.
2. Run `pnpm changeset --empty` to create an empty changeset (signals "no release needed"). This is required because CI enforces changeset presence for any PR that touches package files.
3. `pnpm run commit:cz`

If your changes are entirely outside of `packages/` (e.g., CI config, root docs), you can skip the empty changeset.

### Adding a new package

npm enforces 2FA on first-time package publishes, so new packages cannot be published from CI until they exist on the registry.

1. Create your package under `packages/`.
2. **Publish the first version manually** with 2FA from your local machine:
   ```sh
   cd packages/<new-package>
   npm publish --access public
   ```
3. Update your [npm granular access token](https://www.npmjs.com/settings/satoshibits/tokens/granular-access-tokens/new) to include the new package.
4. From this point on, CI handles all subsequent releases.

> The `ci:publish` script includes a pre-publish check (`scripts/check-new-packages.js`) that will fail the release early with clear instructions if a package hasn't been manually published yet.

### CI/CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **CI** (`.github/workflows/ci.yml`) | Pull request to `main` | Runs build, lint, typecheck, test, test:e2e, and validates changeset presence |
| **Release** (`.github/workflows/release.yml`) | Push to `main` | Creates a Version Packages PR (via changesets), or publishes to npm if versions were already bumped |

### Prerequisites

- Set `NPM_AUTH_TOKEN` as a repository secret in GitHub. Generate one [here](https://www.npmjs.com/settings/satoshibits/tokens/granular-access-tokens/new).
- The token must be a **granular access token** with publish permissions for all `@satoshibits/*` packages.
