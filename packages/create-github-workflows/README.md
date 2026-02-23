# @satoshibits/create-github-workflows

CLI for generating standardized GitHub Actions workflows. Detects your project setup and scaffolds production-ready CI/CD pipelines with a single command.

## Quick Start

```bash
# Interactive setup
npx @satoshibits/create-github-workflows init

# Quick setup with a preset
npx @satoshibits/create-github-workflows init --preset library --yes
```

## Commands

### `init`

Scaffolds a full set of workflows based on your project type.

```bash
create-github-workflows init [options]
```

| Option | Description |
|--------|-------------|
| `-p, --preset <preset>` | Use a preset: `library`, `docker-app`, `monorepo` |
| `-y, --yes` | Skip prompts, use defaults (requires `--preset`) |
| `-f, --force` | Overwrite existing workflow files |

The CLI auto-detects your package manager, Node version, monorepo structure, and Dockerfile presence, then asks you to confirm or customize.

### `add`

Adds a single workflow to an existing project.

```bash
create-github-workflows add <workflow> [options]
```

```bash
# Examples
create-github-workflows add codeql
create-github-workflows add docs-deploy
create-github-workflows add dependabot --force
```

| Option | Description |
|--------|-------------|
| `-f, --force` | Overwrite if the workflow file already exists |

### `list`

Shows all available workflows and their install status.

```bash
create-github-workflows list
```

```
  CI
    ✓ pr-validation   Fast PR feedback with lint, typecheck, and unit tests
    ○ build           Main branch protection with Docker image build
  Security
    ✓ codeql          GitHub CodeQL static analysis
    ○ dependency-audit Scheduled dependency vulnerability audit
  ...
```

## Presets

Presets provide a curated set of workflows for common project types. All presets include **CodeQL** and **Dependabot** by default.

### `library`

For NPM packages. Generates:

| Workflow | File | Purpose |
|----------|------|---------|
| pr-validation | `pr-validation.yml` | Lint, typecheck, test on PRs |
| release-please | `release-please.yml` | Automated versioning and changelogs |
| npm | `publish-npm.yml` | Publish to NPM on release |
| codeql | `codeql.yml` | Weekly security scanning |
| dependabot | `.github/dependabot.yml` | Automated dependency updates |

**Required secrets:** `RELEASE_PAT`, `NPM_TOKEN`

### `docker-app`

For Docker-based applications with deployment environments. Generates:

| Workflow | File | Purpose |
|----------|------|---------|
| pr-validation | `pr-validation.yml` | Lint, typecheck, test on PRs |
| build | `build.yml` | Docker image build on main |
| release-please | `release-please.yml` | Automated versioning and changelogs |
| docker | `publish-docker.yml` | Docker image tagging and promotion |
| staging | `deploy-staging.yml` | Manual staging deployment |
| preview | `deploy-preview.yml` | Manual preview deployment |
| production | `deploy-production.yml` | Tag-triggered production deployment |
| codeql | `codeql.yml` | Weekly security scanning |
| dependabot | `.github/dependabot.yml` | Automated dependency updates |

**Required secrets:** `RELEASE_PAT`, plus platform-specific secrets (DigitalOcean, Kubernetes, or AWS ECS)

### `monorepo`

For multi-package workspaces using changesets. Generates:

| Workflow | File | Purpose |
|----------|------|---------|
| pr-validation | `pr-validation.yml` | Lint, typecheck, test on PRs |
| changesets | `changesets.yml` | Coordinated monorepo releases |
| npm | `publish-npm.yml` | Publish packages to NPM |
| codeql | `codeql.yml` | Weekly security scanning |
| dependabot | `.github/dependabot.yml` | Automated dependency updates |

**Required secrets:** `NPM_TOKEN`

## All Available Workflows

### CI

| Name | Output | Description |
|------|--------|-------------|
| `pr-validation` | `pr-validation.yml` | Lint, typecheck, and test on pull requests. Includes Gitleaks secret detection and dependency audit. |
| `build` | `build.yml` | Main branch protection with Docker image build and validation. Requires Docker configuration. |

### Release

| Name | Output | Description |
|------|--------|-------------|
| `release-please` | `release-please.yml` | Automated version bumps and changelog generation from conventional commits. |
| `changesets` | `changesets.yml` | Monorepo release management with coordinated version bumps across packages. |

### Publish

| Name | Output | Description |
|------|--------|-------------|
| `npm` | `publish-npm.yml` | Publishes packages to NPM on release. Supports scoped packages and access levels. |
| `docker` | `publish-docker.yml` | Promotes Docker images with version tags. Supports GHCR, Docker Hub, and ECR. |

### Deploy

| Name | Output | Description |
|------|--------|-------------|
| `staging` | `deploy-staging.yml` | Manual deployment to staging. Supports DigitalOcean, Kubernetes, and AWS ECS. |
| `preview` | `deploy-preview.yml` | Manual preview deployment from any branch. |
| `production` | `deploy-production.yml` | Tag-triggered production deployment with environment protection. |

### Security

| Name | Output | Description |
|------|--------|-------------|
| `codeql` | `codeql.yml` | GitHub CodeQL static analysis for JavaScript/TypeScript. Runs on push, PRs, and weekly. |
| `dependency-audit` | `dependency-audit.yml` | Weekly dependency vulnerability scan. Opens a GitHub issue if vulnerabilities are found. |

### Maintenance

| Name | Output | Description |
|------|--------|-------------|
| `dependabot` | `.github/dependabot.yml` | Dependabot configuration for automated npm and GitHub Actions dependency updates. **Note:** outputs to `.github/`, not `.github/workflows/`. |
| `stale` | `stale.yml` | Marks issues and PRs as stale after 60 days of inactivity, closes after 7 more days. Exempts `pinned`, `security`, and `bug` labels. |

### Docs

| Name | Output | Description |
|------|--------|-------------|
| `docs-deploy` | `deploy-docs.yml` | Builds and deploys documentation to GitHub Pages. Prompts for build script and output directory during `init`. |

## Package Manager Support

All generated workflows adapt to your package manager:

| Feature | npm | pnpm | yarn | bun |
|---------|-----|------|------|-----|
| Install | `npm ci` | `pnpm install --frozen-lockfile` | `yarn install --frozen-lockfile` | `bun install --frozen-lockfile` |
| Run scripts | `npm run` | `pnpm` | `yarn` | `bun run` |
| Cache | Built-in | Built-in | Built-in | Via `setup-bun` |
| Audit | `npm audit` | `pnpm audit` | `yarn audit` | Falls back to `npm audit` |

## Configuration

Running `init` creates a `.github-workflows.json` config file in your project root. This tracks your selections so that `add` and `list` commands can work with your project context.

```json
{
  "version": 1,
  "projectName": "my-app",
  "preset": "library",
  "packageManager": "pnpm",
  "releaseStrategy": "release-please",
  "nodeVersion": "20",
  "isMonorepo": false,
  "workflows": ["pr-validation", "release-please", "npm", "codeql", "dependabot"],
  "docker": null,
  "npm": { "publish": true, "access": "public" },
  "docs": null
}
```

## GitHub Secrets

After generating workflows, configure the required secrets in your repository:

**Settings > Secrets and variables > Actions**

| Secret | Used by | Notes |
|--------|---------|-------|
| `GITHUB_TOKEN` | Most workflows | Automatically provided by GitHub Actions |
| `RELEASE_PAT` | `release-please` | Personal access token with `contents:write` to trigger downstream workflows |
| `NPM_TOKEN` | `npm`, `changesets` | NPM authentication token for publishing |
| `DOCKERHUB_USERNAME` | `docker` | Only if using Docker Hub registry |
| `DOCKERHUB_TOKEN` | `docker` | Only if using Docker Hub registry |
| `DIGITALOCEAN_ACCESS_TOKEN` | Deploy workflows | Only if deploying to DigitalOcean |
| `KUBE_CONFIG` | Deploy workflows | Only if deploying to Kubernetes |

## Requirements

- Node.js >= 20.11.0
- A `package.json` in your project root

## License

ISC
