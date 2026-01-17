# @satoshibits/create-docs

A CLI tool for scaffolding standardized documentation templates (BRD, FRD, ADD, TSD, ADR).

## Overview

`create-docs` helps teams establish and maintain comprehensive, traceable documentation by generating standardized templates with proper YAML frontmatter, traceability links, and consistent structure. Instead of starting from scratch, get expert-informed templates that guide you through documenting your project's business requirements, functional specs, architecture decisions, and technical specifications.

## Features

- **Three project profiles**: greenfield, migration, library - each with tailored document sets
- **5 CLI commands**: init, new, lint, status, migrate
- **21 Handlebars templates**: covering strategy, requirements, architecture, specs, guidelines, and operations
- **Interactive setup**: guided prompts for technology decisions (database, API style, auth, cloud provider, etc.)
- **Document validation**: lint command checks frontmatter schema, broken links, and stale documents
- **Health tracking**: status command provides at-a-glance view of documentation coverage
- **Migration support**: incrementally adopt the standard structure for existing documentation

## Installation

```bash
npm install @satoshibits/create-docs
# or
pnpm add @satoshibits/create-docs
# or
yarn add @satoshibits/create-docs
```

## Quick Start

Initialize documentation in your project:

```bash
# interactive setup
npx create-docs init

# quick setup with defaults
npx create-docs init -y

# specify profile directly
npx create-docs init --profile greenfield
```

This creates the following structure:

```
docs/
├── README.md
├── 00-meta/
│   └── glossary.md
├── 01-strategy/
│   └── brd.md              # greenfield only
├── 02-requirements/
│   └── frd.md
├── 03-architecture/
│   ├── add.md
│   └── decisions/
├── 04-specs/
│   ├── index.md
│   ├── api.md              # if hasApi
│   ├── authentication.md   # if hasApi
│   ├── database.md         # if hasDatabase
│   └── background-jobs.md  # if hasAsyncProcessing
├── 05-guidelines/
│   ├── coding.md
│   ├── testing.md
│   ├── deployment.md
│   ├── observability.md
│   └── change-management.md  # if isRegulated
├── 06-operations/
│   ├── runbook.md
│   └── security.md
└── archive/
```

Plus a `.create-docs.json` configuration file in your project root.

## Commands Reference

### `init`

Initialize documentation structure and create `.create-docs.json` config.

```bash
create-docs init [options]

Options:
  -p, --profile <profile>  Project profile (greenfield, migration, library)
  -y, --yes                Skip prompts and use defaults
  -f, --force              Overwrite existing docs/ directory
```

**Profiles:**
- **greenfield**: Full document suite including BRD for new projects
- **migration**: Tailored for modernization projects (no BRD)
- **library**: Minimal set for library/package documentation

### `new`

Generate a new document from template.

```bash
create-docs new <type> [name]

Document types:
  adr        Architecture Decision Record (auto-numbered)
  spec       Technical specification (in 04-specs/)
  guideline  Engineering guideline (in 05-guidelines/)
  basic      Generic document template

Examples:
  create-docs new adr "Use PostgreSQL for relational data"
  create-docs new spec api
  create-docs new guideline code-review-process
```

### `lint`

Validate documentation integrity.

```bash
create-docs lint
```

**Checks performed:**
- YAML frontmatter schema validation
- Required fields (title, status, version, owner, last_updated)
- Valid status values (Draft, Review, Approved, Deprecated)
- Broken internal links
- Orphan requirement ID references
- Stale documents (>6 months without update)

### `status`

Display document health table.

```bash
create-docs status
```

**Shows:**
- Document status (Draft, Review, Approved, Deprecated)
- Owner assignment
- Last updated date
- Version numbers
- Coverage metrics

### `migrate`

Migrate existing documentation to standard structure.

```bash
create-docs migrate [options]

Options:
  --dry-run              Show what would change without making modifications
  -t, --tier <tier>      Migration tier (structure, frontmatter, conventions)
  --no-backup            Skip creating backup before migration
  -r, --restore [name]   Restore from backup (list backups if no name given)
  -y, --yes              Skip prompts and use defaults

Migration tiers:
  structure    Move files to standard directory layout (Tier 1)
  frontmatter  Add/standardize YAML frontmatter (Tier 2)
  conventions  Standardize IDs, links, traceability (Tier 3)

Examples:
  create-docs migrate --dry-run           # Preview changes
  create-docs migrate --tier structure    # Move files only
  create-docs migrate                     # Interactive full migration
  create-docs migrate --restore           # List available backups
  create-docs migrate --restore <name>    # Restore from backup
```

## Configuration

The `.create-docs.json` file stores project settings:

```json
{
  "projectName": "my-app",
  "profile": "greenfield",
  "owner": "@lead-engineer",
  "adrCounter": 1,
  "variance": {
    "hasApi": true,
    "hasDatabase": true,
    "hasAsyncProcessing": false,
    "isRegulated": false,
    "databaseEngine": "postgres",
    "ormStrategy": "prisma",
    "apiStyle": "rest",
    "identityProvider": "auth0",
    "cloudProvider": "aws",
    "gitStrategy": "trunk-based"
  },
  "createdAt": "2024-01-15"
}
```

**Key fields:**
- `profile`: Determines which core documents are generated
- `adrCounter`: Auto-increments for ADR numbering
- `variance`: Technology decisions that customize template content

## Templates

### Core Documents
| Template | Description | Location |
|----------|-------------|----------|
| `readme` | Documentation index | `docs/README.md` |
| `glossary` | Project terminology | `docs/00-meta/glossary.md` |
| `brd` | Business Requirements Document | `docs/01-strategy/brd.md` |
| `frd` | Functional Requirements Document | `docs/02-requirements/frd.md` |
| `add` | Application Design Document | `docs/03-architecture/add.md` |
| `adr` | Architecture Decision Record | `docs/03-architecture/decisions/` |

### Specifications (`04-specs/`)
| Template | Description |
|----------|-------------|
| `api` | API endpoints, versioning, authentication |
| `authentication` | Auth flows, token management, session handling |
| `database` | Schema design, migrations, query patterns |
| `background-jobs` | Async processing, queues, scheduled tasks |
| `generic` | Generic specification template |

### Guidelines (`05-guidelines/`)
| Template | Description |
|----------|-------------|
| `coding` | Code style, conventions, best practices |
| `testing` | Test strategy, coverage, frameworks |
| `deployment` | CI/CD, environments, release process |
| `observability` | Logging, metrics, tracing, alerting |
| `change-management` | Change control for regulated environments |
| `generic` | Generic guideline template |

### Operations (`06-operations/`)
| Template | Description |
|----------|-------------|
| `runbook` | Operational procedures, incident response |
| `security` | Security controls, compliance, threat model |

## Document Status Lifecycle

All documents use standardized status values:

```
Draft → Review → Approved → Deprecated
```

- **Draft**: Initial creation, work in progress
- **Review**: Ready for stakeholder review
- **Approved**: Finalized and accepted
- **Deprecated**: No longer current, moved to archive

## Requirements

- Node.js >= 18.0.0

## License

MIT
