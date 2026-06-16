# @satoshibits/doc-lint

A documentation linter that catches semantic gaps in architecture documents. Instead of generic "check for consistency" prompts, doc-lint uses **formally-defined concern schemas** to guide LLM reasoning toward specific engineering invariants.

Think of it as property-based testing, but for documentation.

## The Problem

Multi-round LLM reviews of BRD/FRD/ADD documents catch different issues each time because each review reinvents "what counts as a problem." Critical gaps — state-synchronization conflicts, cryptographic replay vulnerabilities, missing idempotency guarantees — survive multiple expert reviews because they exist in cross-domain interstitial spaces that no single prompt naturally covers.

### What it catches

doc-lint surfaces gaps like:

- A webhook handler that processes payment notifications but has **no deduplication strategy** documented
- A retry policy in the ADD that lacks a corresponding **circuit breaker or timeout budget**
- An FRD that describes "synchronous approval" while the ADD implements an **async queue** — a behavioral contradiction
- Payment retries documented without addressing **what happens on partial completion** or how refunds correlate to retry attempts
- A BRD promising "real-time updates" while the ADD specifies **eventual consistency with a 30-second delay**

These are not style issues. They are cross-domain failure modes that survive expert review because no single reviewer owns the intersection.

## How It Works

doc-lint externalizes the evaluation model into versioned, inspectable YAML schemas called **concerns**. Each concern defines:

- **What** engineering invariant to check (e.g., "every trust-boundary operation must document idempotency")
- **How** to evaluate it (structured questions, evidence requirements, failure conditions)
- **When** to activate it (signal-based trigger matching)

The tool reads your project manifest, matches declared signals to bundled concerns, and assembles fully-specified evaluation prompts with your documents injected.

Findings are **evidence-first**: every gap includes a specific source location (e.g., "ADD Section 4.2"), a confidence level, and the failure condition that triggered it. The principle is "explicit > implicit" — if something is implied but not stated in your documents, that is a gap. doc-lint does not generate opinions; it demands citations.

## Two-Layer Architecture

doc-lint separates **assembly** (free, deterministic) from **evaluation** (optional, API-based):

| Layer | Command | Cost | What It Does |
|-------|---------|------|-------------|
| **Assemble** | `doc-lint assemble --tier <level>` | Free | Loads manifest, matches concerns by tier, builds prompts with full document content |
| **Detect** | `doc-lint detect` | Free | Generates a signal detection prompt for LLM handoff |
| **Lint** | `doc-lint lint --tier <level>` | API calls | Runs assembly, then sends each prompt to an LLM for evaluation |

The assemble layer is the core value. You can inspect exactly what will be sent to the LLM, pipe prompts into your own tooling, or use the `lint` layer for a fully automated flow. The `detect` command generates a standalone prompt that an LLM can use to identify which signals are present in your documentation — useful for bootstrapping or auditing the `signals.declared` list in your manifest.

### Reference Mode (`--no-inline`)

By default, `assemble` and `detect` embed the full content of each document into the generated prompts. This makes prompts self-contained but large. The `--no-inline` flag switches to **reference mode**, where prompts contain file paths instead of content:

```bash
# default: document content inlined into prompts
doc-lint assemble . --tier 1 -f json

# reference mode: prompts contain file paths, consumer reads them
doc-lint assemble . --tier 1 -f json --no-inline
```

In reference mode, prompts instruct the evaluator to "read the following files fully before evaluation" and list each document by label, role, and path. The JSON output includes a `projectRoot` field (absolute path) and each prompt gains a `documents` array with structured references:

```json
{
  "projectRoot": "/absolute/path/to/project",
  "prompts": [{
    "documents": [
      { "role": "brd", "label": "BRD", "path": "docs/brd.md" }
    ]
  }]
}
```

Use `--no-inline` when the consumer has filesystem access (agentic CLIs, IDEs with tool-use, CI pipelines) and you want smaller prompts or to avoid duplicating document content across multiple prompt files.

### Evaluation Engines (`sdk` vs `agent`)

`lint` evaluates each assembled prompt through a pluggable **engine** (`--engine`). The contract is `evaluate(prompt, context?)`: the prompt is pure *intent* (the concern + schema), and an optional `EvaluationContext` carries *execution authority* (a read-only, repo-scoped sandbox).

| Engine | How it evaluates | When to use |
|--------|------------------|-------------|
| `sdk` (default) | Toolless: one Anthropic call per prompt. All evidence is pre-stuffed into the prompt (inlined docs + the reconcile code map). | The simple, cheap default. Deterministic prompt you can inspect. |
| `agent` | Agentic: an Anthropic tool-use loop with **read-only** `list_dir`/`grep`/`read_file` tools scoped to the repo. It reads the real source on demand and cites `file:line`. | When you want the evaluator to verify against the actual code, not a static summary. Needs no code map. |

**The lens (`--lens`)** reframes the concern's question without changing the concern library. A concern is a *system principle*; the lens decides which question it asks and which roots it reads:

| Lens | Question | Output |
|------|----------|--------|
| `docs` (default) | Is X **documented**? | doc gaps (byte-identical to prior behavior) |
| `code` | Does the system **satisfy** X, per the source? | implementation risks |
| `reconcile` | Do docs and code **agree** on X? | drift |

**Completeness & honesty.** The `agent` engine enforces enumerate-before-conclude (it must search/list before asserting an absence) and self-reports coverage. If a run's exploration was cut short — a turn limit, a `max_tokens` truncation, a `required` source it never read, or a missing API key — its findings are flagged `requiresHumanReview`, the result `summary` gains an `incompleteEvaluations` count, the human output reads `RESULT: INCONCLUSIVE`, and the CLI **exits non-zero**. An unverified "we found nothing" never passes green. The toolless `sdk` engine reports no coverage and is unaffected.

> The `sdk` engine remains the default and is unchanged. `agent` is opt-in via `--engine agent` (CLI) or by passing `AnthropicAgentEngine` to `lint()` programmatically.

## Tier System

Concerns are assigned to **tiers** that control evaluation scope. The `--tier` flag is required for `assemble` and `lint` commands:

| Tier | Scope | What It Includes |
|------|-------|-----------------|
| `1` | Foundational | Core correctness checks (e.g., failure-domain-isolation, state-ownership-clarity) |
| `2` | Behavioral | Tier 1 + behavioral integrity (e.g., idempotency-boundaries, api-contract-consistency, resilience-triad) |
| `3` | Structural | Tier 1 + 2 + structural coherence (e.g., horizontal-traceability) |
| `all` | Everything | All tiers + interaction matrices |

Tiers are **cumulative**: `--tier 2` includes all concerns with tier <= 2. Interaction matrices (cross-domain checks) are only included with `--tier all`. Concerns without a tier assignment are excluded unless `--tier all` is used.

Start with `--tier 1` for foundational gaps, then expand scope as your documentation matures.

## Operating Modes

doc-lint started as a doc-vs-doc linter but also serves code-first repos. The `mode`
field in the manifest (default `doc-first`) selects behavior:

| Mode | Inputs | What it does |
|------|--------|--------------|
| `doc-first` (default) | Authored docs | Evaluate concerns over your BRD/FRD/ADD (original behavior, unchanged). |
| `reconcile` | Authored docs **+** source code | Run concerns over the docs **plus** a documentation↔code **drift scanner** that flags where the docs and the implementation disagree. The fit for the common "docs drifted from code" case. |
| `code-first` | Source code (no docs) | An **onboarding mode**, not a lint mode. `doc-lint bootstrap` scaffolds as-built docs + a documentation gap inventory from a static scan so you can start. You fill in the intent, then move to doc-first/reconcile. |

`reconcile` and `bootstrap` build a lightweight, language-agnostic **code map** (file
tree, dependencies, routes, models, external calls, env vars) via a cheap static scan
(`doc-lint scan`) — no LLM. The code map is a *sampled, best-effort* view: anything it
doesn't surface is treated as "not scanned", never "not implemented".

> **Why no "lint my code against concerns with no docs"?** Linting docs *synthesized
> from your code* is circular — "is X documented?" collapses into "is X implemented?",
> and an LLM asked to write as-built prose will sometimes invent intent the code doesn't
> have. So code-first is a deterministic **scaffolder** (`bootstrap`), and the only sound
> code-aware *evaluation* is `reconcile` (authored intent vs. real code).

## When to Use

doc-lint is designed for **architecture documentation suites** (BRD, FRD, ADD) in systems involving distributed services, payment processing, async workflows, or external API integrations. It is most valuable when:

- Your project has 3+ architecture documents that must stay consistent
- Your system touches domains where cross-cutting concerns cause subtle gaps
- You want repeatable, versioned evaluation criteria rather than ad-hoc LLM prompts
- **Your docs have drifted from the code** and you want to find the gaps (`reconcile`)
- **You have no architecture docs** and want a scaffold to start from (`bootstrap`)

It works with existing documentation suites too — map your architecture docs to the required roles regardless of what you call them.

It is **not** a grammar checker, style linter, or general-purpose document validator.

## Installation

```bash
npm install @satoshibits/doc-lint
# or
pnpm add @satoshibits/doc-lint
```

For the `lint` command (optional — requires API calls):

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=your-key
```

The `ANTHROPIC_API_KEY` environment variable must be set in your shell. doc-lint does not load `.env` files automatically. The built-in engine uses `claude-sonnet-4-5-20250929` with `temperature: 0`.

**Privacy note:** The `assemble` command is fully local — no data leaves your machine. The `lint` command sends document content to the Anthropic API for evaluation. Use `assemble` if you want to evaluate prompts through your own tooling or a different provider.

## Quick Start

### 0. Explore available concerns

```bash
doc-lint list
```

This shows all 28 bundled concerns grouped by category, with their trigger signals, severity, and tier. Use this to understand which signals to declare in your manifest.

### 1. Initialize a manifest

The fastest way to get started — `init` discovers your documents and detects signals automatically:

```bash
# interactive mode (prompts for document selection, signal confirmation)
doc-lint init .

# non-interactive mode (auto-selects first match, uses high+medium confidence signals)
doc-lint init . --yes
```

Or create `doc-lint.yaml` (or `doc-lint.yml`) manually in your project root:

```yaml
version: "1.0"

project:
  name: "My Payment Service"

documents:
  required:
    - role: brd
      path: docs/brd.md
    - role: frd
      path: docs/frd.md
    - role: add
      path: docs/add.md
  optional:
    - role: tsd
      path: docs/tsd.md
      label: "Technical Spec"

signals:
  declared:
    - external-api
    - payments
    - webhooks
    - async-workflows
```

### 2. Assemble evaluation prompts

```bash
# outputs JSON with all assembled prompts (tier 1 = foundational checks)
doc-lint assemble . --tier 1 -f json

# human-readable summary with all tiers
doc-lint assemble . --tier all -f human

# write each prompt as a standalone .md file (best for LLM handoff)
doc-lint assemble . --tier 1 -o ./prompts
```

Example human output:

```
doc-lint assemble: My Payment Service
Signals: external-api, payments, webhooks
Matched concerns (tier 1): 2
  + feasibility-check [tier 1]
  + threat-model-coverage [tier 1]
Skipped concerns: 9
  - api-contract-consistency [tier 2]
  - idempotency-boundaries [tier 2]
  - resilience-triad [tier 2]
  - input-validation [tier 2]
  - ...
Total prompts assembled: 3
```

### 3. Detect signals with LLM assistance (optional)

If you're unsure which signals to declare, generate a detection prompt and hand it to your LLM of choice:

```bash
# write a self-contained prompt file for LLM handoff
doc-lint detect . -o ./prompts

# or output as JSON for piping into tooling
doc-lint detect . -f json
```

The generated prompt includes the full signal vocabulary, your document content, and a JSON response schema. Feed it to any LLM — the response tells you which signals are present and at what confidence. Use the result to populate or update `signals.declared` in your manifest.

### 4. Run full lint (requires Anthropic API key)

```bash
# foundational checks only
doc-lint lint . --tier 1

# all checks including interaction matrices
doc-lint lint . --tier all --verbose

# dry run — show which concerns matched without calling the API
doc-lint lint . --tier all --dry-run

# filter to only show errors and warnings
doc-lint lint . --tier 2 --severity-threshold warn
```

### Code-first or stale-docs repos

```bash
# inspect the code map (no LLM, no API key)
doc-lint scan . --ignore "**/.claude/worktrees/**"

# no docs? scaffold as-built docs + a gap inventory from the code (deterministic, no LLM)
doc-lint bootstrap .               # writes .doc-lint/bootstrap/*.md
# → fill in the TODOs (intent the code can't supply), then:
doc-lint lint .                    # lint your now-authored docs

# docs exist but drifted from code? reconcile them
doc-lint reconcile .               # = lint --mode reconcile (docs + drift scanner)
```

## CLI Reference

### `doc-lint init [path]`

Initializes a `doc-lint.yaml` manifest by discovering documents and detecting signals. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `-y, --yes` | Non-interactive mode: auto-select first match per role, include high+medium confidence signals | interactive |
| `--ignore <glob>` | Glob pattern to ignore during discovery (repeatable) | - |

**Interactive mode** (default): Discovers documents matching known role patterns (BRD, FRD, ADD, plus optional roles like API specs and runbooks). For each role, prompts you to select from candidates or enter a path manually. Detects signals from document content and lets you confirm/toggle which to include. Prompts for project name and classification.

**Non-interactive mode** (`--yes`): Auto-selects the first match for each required role (errors if none found). Includes signals detected at high or medium confidence. Uses directory basename as project name and "standard" as classification.

**Discovery patterns:** Searches for files matching role-specific patterns (e.g., `brd.md`, `*-brd.md`, `business-requirements*` for BRD). Built-in ignores: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`. Files over 1MB and binary files are skipped.

### `doc-lint assemble [path]`

Assembles evaluation prompts without making any API calls. `[path]` is the project root directory containing `doc-lint.yaml` (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `--tier <level>` | **Required.** Tier scope: `1`, `2`, `3`, or `all` | - |
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` or `doc-lint.yml` |
| `-f, --format <format>` | Output format: `human` or `json` (to stdout) | *required if `-o` not set* |
| `-o, --output-dir <path>` | Write each prompt as a standalone `.md` file to this directory | *required if `-f` not set* |
| `--no-contradiction` | Skip the contradiction scanner prompt | enabled |
| `--concerns <ids>` | Only specific concerns (comma-separated) | all matched |
| `--auto-detect` / `--no-auto-detect` | Auto-detect signals from document content | manifest value or `false` |
| `--warn-on-mismatch` / `--no-warn-on-mismatch` | Warn when detected signals differ from declared | manifest value or `false` |
| `--no-inline` | Reference documents by file path instead of inlining content | inline (content embedded) |

One of `-f` or `-o` must be provided. If both are given, `-o` takes priority. When `--output-dir` is used, each assembled prompt is written as an individual Markdown file (e.g., `idempotency-boundaries.md`) with YAML front-matter metadata. These files are self-contained and ready to hand off to any external LLM.

### `doc-lint detect [path]`

Generates a self-contained signal detection prompt for LLM handoff. The prompt includes the full signal vocabulary, your project documents, and a JSON response schema. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` or `doc-lint.yml` |
| `-f, --format <format>` | Output format: `human` or `json` (to stdout) | *required if `-o` not set* |
| `-o, --output-dir <path>` | Write `signal-detection.md` to this directory | *required if `-f` not set* |
| `--no-inline` | Reference documents by file path instead of inlining content | inline (content embedded) |

One of `-f` or `-o` must be provided. If both are given, `-o` takes priority. The output includes the signal vocabulary (closed set), document content, and a JSON response schema with `signals` (id, confidence, rationale) and `unmappedConcepts` fields.

**Workflow:** `detect` -> feed prompt to LLM -> use response to update `signals.declared` in manifest -> `assemble` or `lint`.

### `doc-lint lint [path]`

Assembles prompts and evaluates them via the Anthropic SDK. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `--tier <level>` | **Required.** Tier scope: `1`, `2`, `3`, or `all` | - |
| `--engine <engine>` | Evaluation engine: `sdk` (toolless, single call) or `agent` (reads real source via tools) | `sdk` |
| `--lens <lens>` | Evidence lens: `docs` (is X documented?), `code` (does the system satisfy X?), `reconcile` (do docs and code agree?) | `docs` |
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` or `doc-lint.yml` |
| `-f, --format <format>` | Output format: `human` or `json` | `human` |
| `--no-contradiction` | Skip the contradiction scanner | enabled |
| `--no-drift` | Skip the documentation↔code drift scanner (reconcile mode) | enabled |
| `--mode <mode>` | Override mode: `doc-first` \| `reconcile` | manifest `mode` |
| `--code <paths>` | Source roots to scan (comma-separated) | manifest `code.paths` |
| `--concerns <ids>` | Only specific concerns (comma-separated) | all matched |
| `--dry-run` | Show matched concerns without evaluating | - |
| `--verbose` | Show detailed progress | - |
| `--severity-threshold <level>` | Minimum severity to display: `error`, `warn`, or `note` | all findings |
| `--allow-implicit` | Record that implicit documentation is accepted as coverage | - |
| `--allow-external-refs` | Record that external references are accepted as partial coverage | - |
| `--auto-detect` / `--no-auto-detect` | Auto-detect signals from document content | manifest value or `false` |
| `--warn-on-mismatch` / `--no-warn-on-mismatch` | Warn when detected signals differ from declared | manifest value or `false` |

**Exit codes:** `0` = pass, `1` = errors found **or run inconclusive** (an `agent`-engine run whose exploration was cut short — see [Evaluation Engines](#evaluation-engines-sdk-vs-agent)), `2` = tool error. The toolless `sdk` engine never reports coverage, so it never exits inconclusive.

**Tolerance flags:** `--severity-threshold` actively filters findings from output. `--allow-implicit` and `--allow-external-refs` are recorded in the result's `toleranceApplied` field for audit purposes but do not currently filter findings.

Running `lint` on a **code-first** project (no authored docs) exits `2` and directs you
to `doc-lint bootstrap` — linting docs synthesized from code is circular, so it's not
offered.

### `doc-lint reconcile [path]`

Sugar for `lint --mode reconcile`. Evaluates concerns over your authored docs **and**
runs the drift scanner against the code map. Same options as `lint` (minus `--mode`).

### `doc-lint bootstrap [path]`

The **code-first on-ramp**. Deterministically (no LLM, no API key) scaffolds evidence-named
as-built docs + a documentation gap inventory from a static code scan, so a repo with no
docs has somewhere to start. Facts (routes, deps, models, env) are filled from the code;
**intent is left as explicit TODOs** — code can't tell you the *why*. Fill those in, then
lint in doc-first or reconcile mode.

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Path to manifest file | Auto-detect (optional) |
| `-o, --out <dir>` | Output directory for scaffolds | `.doc-lint/bootstrap` |
| `--code <paths>` | Source roots to scan (comma-separated) | `.` |
| `--ignore <globs>` | Extra ignore globs (comma-separated) | built-in ignores |

Writes `architecture-as-built.md`, `functional-surface.md`, `operations-surface.md`, and
`doc-todos.md` (the gap inventory — every concern your code's signals trigger, with what
you must document to satisfy it). Works with or without a manifest; without one it detects
signals from the code.

### `doc-lint scan [path]`

Builds and prints the **code map** for a repo — file tree, parsed `package.json`
dependencies, statically-detected routes/models/external calls, env vars, and config
signals. No LLM, no API key. The code analog of `assemble`: inspect what the drift and
bootstrap layers consume.

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: `human` or `json` | `human` |
| `--code <paths>` | Source roots to scan (comma-separated) | `.` |
| `--ignore <globs>` | Extra ignore globs (comma-separated) | built-in ignores |

> Note: heavy directories (e.g. git worktrees under `.claude/worktrees`) are not
> ignored by default — pass `--ignore "**/.claude/worktrees/**"` (or set `code.ignore`
> in the manifest) to keep scans fast.

### `doc-lint init [path]`

Generates a `doc-lint.yaml` by discovering documents and detecting signals. If no
architecture docs are found, it falls back to **code-first**: it scans the source,
detects signals from dependencies/code, and writes a `mode: code-first` manifest — then
run `doc-lint bootstrap` to scaffold docs. Use `-y, --yes` for non-interactive mode.

**Understanding findings:** Each finding has a `severity` (error, warn, note) and a `confidence` (high, medium, low). High-confidence errors are hard blockers. Low-confidence errors are flagged with `requiresHumanReview: true` — they indicate a potential gap that the evaluator could not confirm with certainty.

### `doc-lint list`

Lists all bundled concerns grouped by category (core, promise-validation, security, operational, compliance, test-coverage) with trigger signals, severity, version, and tier assignment. Interaction matrices are shown in a separate section.

## Manifest Reference

The `doc-lint.yaml` (or `doc-lint.yml`) manifest declares your project's documents and signals.

```yaml
version: "1.0"            # manifest schema version

mode: doc-first           # optional: doc-first (default) | reconcile | code-first

project:
  name: "Project Name"     # required
  description: "Optional"  # optional
  classification: financial # optional: standard | financial | healthcare | infrastructure

code:                       # used in reconcile / code-first modes
  paths: ["apps", "packages"]   # source roots to scan (default: ["."])
  ignore: ["**/.claude/worktrees/**"]  # extra ignore globs
  entrypoints: ["apps/server/src/server.ts"]  # optional hints
  maxInputTokens: 60000     # optional soft cap for code summarization

documents:                  # optional in code-first mode (use `bootstrap` to scaffold)
  required:                 # must exist on disk; validated at load time
    - role: brd             # semantic tag — your file can have any name
      path: docs/brd.md
      label: "Business Requirements"  # optional display name
    - role: frd
      path: docs/frd.md
    - role: add
      path: docs/add.md
  optional:                 # silently skipped if missing
    - role: tsd
      path: docs/tsd.md
  contracts:                # optional: API specs, schemas, interface contracts
    - role: api_spec
      path: docs/openapi.yaml
  operational:              # optional: runbooks, incident response
    - role: runbook
      path: docs/runbook.md
  reference:                # optional: standards, compliance docs
    - role: security_standards
      path: docs/security-standards.md

signals:
  declared:                 # determines which concerns activate
    - external-api
    - payments
    - webhooks
  auto_detect: false        # optional: auto-detect signals from documents
  warn_on_mismatch: true    # optional: warn when detected signals differ from declared

tolerance:                  # optional: filter findings by severity
  severity_threshold: warn  # only report findings at this level or above (error, warn, note)
  allow_implicit: false     # recorded in output but not currently enforced as a filter
  allow_external_refs: true # recorded in output but not currently enforced as a filter

exclusions:                 # optional: skip specific components or concerns
  - component: legacy-auth-module       # exclude findings for this component
    reason: "Scheduled for deprecation"
    approved_by: tech-lead              # optional
  - concernId: threat-model-coverage    # skip this concern entirely (saves API calls)
    reason: "Not applicable to internal tooling"
  - component: admin-panel              # both component and concernId can be combined
    concernId: input-validation
    reason: "Internal-only admin interface"
```

### Document Roles

The `role` field is a semantic tag that maps your document to its function in the validation pipeline — your files can have any name. For example, if your architecture document is called `system-design.md`, use `role: add` with `path: system-design.md`. The three required roles are:

- **brd** — business requirements (the "what" and "why")
- **frd** — functional requirements (the "what it does")
- **add** — architecture design (the "how it's built")

`brd`/`frd`/`add` are required in `doc-first` mode. In `reconcile` mode any authored
docs are accepted (no fixed roles), and in `code-first` mode documents are optional —
run `doc-lint bootstrap` to scaffold evidence-named as-built docs you then author and
commit.

### Signals

Signals are tags that describe your system's characteristics. They determine which bundled concerns are activated:

- **Core concerns** activate when *any* of their trigger signals match (`any_of`)
- **Interaction matrices** activate when *all* of their trigger signals match (`all_of`), with optional `alternative_triggers` providing additional activation paths

Run `doc-lint list` to see available signals for each concern.

#### Signal Auto-Detection

By default, only the `declared` signals in your manifest are used. Two optional settings let doc-lint detect signals from your document content:

| Setting | Effect |
|---------|--------|
| `auto_detect: true` | Scans documents for signal keywords, then **merges** detected signals (high+medium confidence) with declared signals. This expands concern coverage without manual manifest edits. |
| `warn_on_mismatch: true` | Scans documents and **compares** detected signals against declared signals. Reports undeclared signals (found in docs but not declared) and stale signals (declared but not found in docs). Does NOT merge — effective signals remain the declared list. |

Both can be set together: `auto_detect` merges for expanded coverage while `warn_on_mismatch` reports the drift. Settings can be defined in the manifest or overridden per-run with CLI flags (`--auto-detect`, `--warn-on-mismatch`). CLI flags take precedence over manifest values.

**How detection works:** doc-lint preprocesses documents (strips YAML frontmatter, code blocks, inline code, URLs) then matches against a vocabulary of signal keywords using case-insensitive word-boundary matching. Confidence is assigned based on keyword coverage: **high** (>= 3 matched keywords AND >= 60% of signal's keyword list), **medium** (>= 2 AND >= 30%), **low** (below medium). Only high and medium confidence signals are included in auto-detect merges and `init --yes` mode.

### Exclusion Behavior

Exclusions work at two levels, applied independently (OR, not AND):

- **Concern-level** (`concernId`): Excludes the entire prompt from evaluation, saving API calls. Applied before evaluation.
- **Component-level** (`component`): Excludes findings where `relatedItem` matches the component name exactly or starts with `component.` (prefix match). Applied after evaluation.

When an exclusion entry has both `component` and `concernId`, each filter operates at its own stage — `concernId` filters prompts pre-evaluation and `component` filters findings post-evaluation. They are not applied as a combined AND condition.

The contradiction scanner is never excluded, even if listed in exclusions.

## Bundled Concerns

doc-lint ships with 44 bundled concerns (including 3 interaction matrices) across 7 categories. Run `doc-lint list` for the full listing with trigger signals. Concerns marked **(code-aware)** reconcile docs against the code map in `reconcile` mode; the rest are doc-vs-doc.

### Core (10)

Each core concern activates when *any* of its trigger signals match your declared signals.

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `api-contract-consistency` | FRD/ADD claims about endpoints, error codes, auth schemes, and required fields match the actual API specification | external-api, rest-api, graphql, async-api, webhooks |
| `durable-persistence` | Long-running processes have documented resume/checkpoint points and crash recovery behavior | async-workflows, long-running, orchestration, durable-execution, batch-processing, saga |
| `failure-domain-isolation` | Each component declares its failure blast radius, propagation mode (sync/async), and containment mechanism | microservices, distributed, multi-component, event-driven |
| `horizontal-traceability` | Requirements trace from BRD through FRD to ADD with no orphaned or untraceable items | requirements-tracing, compliance, audit, enterprise |
| `idempotency-boundaries` | Every trust-boundary operation (API call, webhook, DB write) documents its idempotency mechanism, duplicate behavior, and idempotency window | external-api, webhooks, payments, async-workflows, message-queue, event-driven, distributed |
| `resilience-triad` | Every external dependency has documented timeout, retry policy, AND circuit breaker — and validates coherence: `total_timeout >= retry_count * per_attempt_timeout` | external-api, external-dependency, microservices, distributed |
| `state-ownership-clarity` | Every cross-boundary state has a declared owner, write access model, and conflict resolution strategy | microservices, distributed, async-workflows, event-driven, message-queue |
| `data-model-ownership` | Every persisted entity has a documented owning component and lifecycle (create/mutate/delete) | database, persistence, data-model, multi-component, microservices, state-management |
| `endpoint-parity` **(code-aware)** | Implemented routes ↔ documented endpoints both directions (statically-detected routes only) | rest-api, public-api, external-api, webhooks |
| `schema-doc-parity` **(code-aware)** | Documented data entities ↔ detected ORM models (recognized ORM patterns only) | database, persistence, data-model, state-management |

### Promise Validation (3)

Validates that architectural promises (SLAs, scalability claims, feasibility) are backed by concrete mechanisms.

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `feasibility-check` | External dependencies and integrations have documented fallback strategies | external-api, third-party, integration, legacy-system |
| `scalability-claim-validation` | Scalability claims are backed by specific mechanisms, not just aspirational statements | scalability, high-traffic, load-balancing, auto-scaling |
| `sla-architecture-alignment` | SLA targets (availability, latency) are achievable given the documented architecture | sla, availability, performance, uptime |

### Security (4)

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `auth-boundary-consistency` | Authentication and authorization boundaries are consistent across all documents | authentication, authorization, multi-tenant, rbac |
| `input-validation` | System boundaries document input validation, sanitization, and rejection strategies | external-api, webhooks, user-input, file-upload |
| `secrets-management` | Secrets, credentials, and API keys have documented rotation, storage, and access policies | secrets, credentials, api-keys, encryption, certificates |
| `threat-model-coverage` | Every documented attack surface has a corresponding threat model with mitigations | security, authentication, pii, payments, external-api |

### Operational (7)

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `alerting-slo-alignment` | Alerting rules are aligned with SLO targets and thresholds | sla, monitoring, observability, alerting |
| `dependency-runbook` | External dependencies have documented runbook procedures for failure scenarios | external-api, third-party, database, message-queue |
| `failure-mode-coverage` | Documented failure modes have corresponding detection, alerting, and recovery procedures | distributed, microservices, external-api, async-workflows |
| `rollback-documentation` | Deployments and migrations have documented rollback procedures | deployment, ci-cd, database-migration, feature-flags |
| `dependency-drift` **(code-aware)** | External deps in `package.json`/imports ↔ documented dependency list | external-dependency, third-party, external-api, payments, message-queue |
| `config-surface-documentation` | Every env var / config knob is documented (purpose, required-ness, default, secret) | external-dependency, deployment, configuration, secrets, infrastructure |
| `background-job-observability` | Each background job documents schedule, idempotency, failure handling, and monitoring | async-workflows, background-jobs, scheduled-tasks, message-queue, long-running, event-driven |

### Compliance (5)

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `api-versioning-compliance` | API versioning strategy is documented and consistent with backward-compatibility claims | external-api, api-versioning, public-api, backward-compatibility |
| `auth-scheme-compliance` | Authentication schemes follow documented standards and are consistently applied | authentication, oauth, saml, sso, jwt |
| `data-retention-compliance` | Data retention policies are documented with specific timeframes and deletion procedures | pii, gdpr, data-retention, user-data, privacy |
| `logging-pii-compliance` | Logging practices do not leak PII and comply with documented privacy requirements | logging, pii, audit, observability, gdpr |
| `public-contract-versioning` | Public contracts (REST/events/SDK) document versioning, stability, and deprecation policy | public-api, rest-api, api-versioning, webhooks, external-api |

### Test Coverage (3)

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `boundary-condition-coverage` | Boundary conditions (limits, quotas, edge cases) have corresponding test documentation | validation, limits, quotas, rate-limiting, testing |
| `error-path-coverage` | Error paths and failure scenarios have documented test coverage | error-handling, resilience, fault-tolerance, testing |
| `requirement-test-mapping` | Requirements have traceable test coverage with no untested acceptance criteria | testing, qa, acceptance-criteria, requirements-tracing |

### Interaction Matrices (3)

Interaction matrices activate when *all* primary trigger signals are present (or any `alternative_triggers` set matches). They check for failure modes that emerge at the intersection of two domains — gaps that pass single-concern review but fail in combination. Only included with `--tier all`.

| ID | What It Checks | Failure Modes | Primary triggers (all_of) | Alternative triggers |
|----|---------------|---------------|--------------------------|---------------------|
| `async-times-approval` | Approval workflows processed asynchronously | duplicate-approval, approval-timeout, orphaned-workflow, race-condition, order-inversion | async-workflows, approval-gates | [message-queue, authorization], [event-driven, workflow-approval], [eventual-consistency, human-in-loop] |
| `retry-times-payment` | Payment operations with retry policies | partial-completion, inconsistent-state, refund-ambiguity, timeout-ambiguity | payments, retry-policy | [payments, external-api], [payments, resilience-triad] |
| `webhook-times-security` | Webhooks received from external providers | event-spoofing, replay-attack, payload-tampering, timing-attack | webhooks, external-api | [webhooks, payments], [webhooks, security], [inbound-events, external-api] |

### Contradiction Scanner

Always included by default (disable with `--no-contradiction`). Compares all documents for:

- **Quantitative conflicts** — different numbers for the same metric
- **Temporal conflicts** — different timing guarantees
- **Behavioral conflicts** — different descriptions of how something works
- **Scope conflicts** — different boundaries for the same feature

### Drift Scanner (reconcile mode)

In `reconcile` mode, a documentation↔code drift scanner runs alongside the concerns
(disable with `--no-drift`). It compares your authored docs against the code map and
reports three kinds of drift, each with a `file:line` citation and confidence:

- **documented-not-implemented** — docs describe an endpoint/model/dependency the code map doesn't contain
- **implemented-not-documented** — the code map shows a route/model/dependency the docs never mention
- **value-mismatch** — both describe the same thing with different values (retry counts, timeouts, endpoint paths, model fields)

Because the code map is sampled, anything the scanner can't confirm is marked
`requiresHumanReview` rather than asserted as drift. Drift errors count toward the exit code.

## Programmatic API

```typescript
import { assemble, lint, SdkEngine } from "@satoshibits/doc-lint";
import type { AssembleResult, LintResult } from "@satoshibits/doc-lint";

// assemble prompts (free, no LLM calls — but async: it may build a code map)
const assembled: AssembleResult = await assemble({
  projectPath: "./my-project",
  configPath: "doc-lint.yaml",       // optional
  contradiction: true,                // default: true
  drift: true,                        // default: true (reconcile mode)
  mode: "reconcile",                  // optional override
  filterConcernIds: ["idempotency-boundaries"],  // optional
  tierFilter: 2,                      // 1, 2, 3, or "all" (omit to include all tiers)
  autoDetect: true,                   // optional: merge detected signals with declared
  warnOnMismatch: true,               // optional: report signal drift
  inline: false,                      // optional: false = file path references instead of content
});

console.log(assembled.version);          // "2.0"
console.log(assembled.prompts.length);   // number of prompts generated
console.log(assembled.concerns.matched); // ["idempotency-boundaries"]
console.log(assembled.concerns.matchedDetails); // [{ id, tier?, type }]
console.log(assembled.signals.effective); // signals used for concern matching
console.log(assembled.signals.mismatch); // { undeclared: [...], stale: [...] } or undefined

// each prompt has system + user messages ready for any LLM
for (const prompt of assembled.prompts) {
  console.log(prompt.concernId);  // e.g. "idempotency-boundaries"
  console.log(prompt.system);     // system message
  console.log(prompt.user);       // user message with full doc content
}

// full lint with Anthropic SDK
const engine = new SdkEngine();  // reads ANTHROPIC_API_KEY from env
// or: new SdkEngine("sk-ant-...")  // pass API key directly
const result: LintResult = await lint({
  projectPath: "./my-project",
  engine,
  tierFilter: "all",
  onProgress: (msg) => console.error(msg),
  tolerance: {                        // optional
    severity_threshold: "warn",
  },
});

console.log(result.summary);
// { totalFindings: 3, errors: 1, warnings: 2, notes: 0, contradictions: 0, drifts: 0, humanReviewRequired: 1 }
// agentic runs may also carry `incompleteEvaluations` when exploration was cut short
console.log(result.coverage);
// { concernsEvaluated: [...], concernsSkipped: [...], concernsExcluded: [...], documentsLoaded: [...], documentsMissing: [...] }
```

### Key Exports

```typescript
// Functions & engines
import { assemble, lint, SdkEngine, AnthropicAgentEngine } from "@satoshibits/doc-lint";

// Input types
import type { AssembleInput, LintInput } from "@satoshibits/doc-lint";

// Result types
import type {
  AssembleResult,
  LintResult,
  Finding,
  ContradictionFinding,
  DriftFinding,
  DriftType,
  Severity,
  Confidence,
} from "@satoshibits/doc-lint";

// Engine types (for custom engines)
import type {
  EvaluationEngine,
  EvaluationResult,
  EvaluationContext,   // execution authority: projectRoot, sources, sandbox, completeness
  EvaluationSource,
  EvaluationSandbox,
  CompletenessPolicy,
  EvaluationCoverage,  // engine's self-reported proof-of-work (agentic engines)
  Lens,                // "docs" | "code" | "reconcile"
} from "@satoshibits/doc-lint";

// Schema and manifest types
import type {
  DocLintManifest,
  DocLintMode,
  CodeConfig,
  CodeMap,
  DocumentRef,
  DocumentReference,
  ConcernSchema,
  InteractionSchema,
  ConcernOrInteraction,
  LoadedConcern,
  AssembledPrompt,
} from "@satoshibits/doc-lint";
```

> **Note:** `assemble()` is `async` — it may build a (no-LLM) code map in reconcile
> mode. `await` it. `lint()` rejects `code-first` projects (no docs to lint) and points
> to `bootstrap`; the `bootstrap` command is deterministic and exported separately.

### Evaluation engines

Two engines ship in the box (see [Evaluation Engines](#evaluation-engines-sdk-vs-agent)):

```typescript
import { lint, SdkEngine, AnthropicAgentEngine } from "@satoshibits/doc-lint";

// toolless (default) — evidence pre-stuffed into the prompt
await lint({ projectPath: ".", engine: new SdkEngine(), tierFilter: "all" });

// agentic — reads real source via read-only tools, reports coverage
await lint({ projectPath: ".", engine: new AnthropicAgentEngine(), tierFilter: "all", lens: "code" });
```

**Custom engine.** Implement `EvaluationEngine` to use any LLM. The second `context`
parameter is optional — a toolless engine ignores it; an agentic engine uses its
read-only sandbox (`context.sandbox.allowedReadRoots`) to read source and returns
`coverage` so incomplete runs stay honest:

```typescript
import type { EvaluationEngine, AssembledPrompt, EvaluationContext } from "@satoshibits/doc-lint";

class MyEngine implements EvaluationEngine {
  async evaluate(prompt: AssembledPrompt, context?: EvaluationContext) {
    const response = await myLlmClient.chat({ system: prompt.system, user: prompt.user });
    return { ok: true, content: response.text };
    // or: { ok: false, error: "rate limited" }
    // agentic engines may also return `coverage: { ..., completeness: "partial" }`
  }
}

const result = await lint({ projectPath: ".", engine: new MyEngine(), tierFilter: "all" });
```

### Output Structure

Results use schema version `"2.0"`. Each finding in the `LintResult` has this shape:

```typescript
interface Finding {
  id: string;                        // e.g. "gap-1"
  concernId: string;                 // e.g. "idempotency-boundaries"
  relatedItem: string;               // e.g. "StripeWebhookController.handleEvent"
  severity: "error" | "warn" | "note";
  confidence: "high" | "medium" | "low";
  description: string;               // what is missing
  sourceSearched: string;            // where the evaluator looked
  failureConditionTriggered: string; // which schema condition fired
  risk: string;                      // concrete consequence if unaddressed
  recommendation: string;            // specific documentation to add
  requiresHumanReview: boolean;      // true when confidence is low
}
```

Example JSON finding (from `doc-lint lint . --tier all -f json`):

```json
{
  "id": "gap-1",
  "concernId": "idempotency-boundaries",
  "relatedItem": "StripeWebhookController.handleEvent",
  "severity": "error",
  "confidence": "high",
  "description": "Webhook handler has no duplicate event protection documented",
  "sourceSearched": "ADD Section 4.2, FRD Section 3",
  "failureConditionTriggered": "idempotency_documented is FALSE",
  "risk": "Stripe at-least-once delivery could process the same event twice, double-updating the order",
  "recommendation": "Document use of event.id for deduplication; specify storage mechanism and TTL",
  "requiresHumanReview": false
}
```

Contradiction findings have a different structure with `statementA`, `statementB`, `conflictType` (`quantitative`, `temporal`, `behavioral`, `scope`), and `explanation` fields.

The `LintResult` also includes `toleranceApplied`, `exclusionsApplied`, and `coverage` fields for audit and CI integration. With the `agent` engine, `summary.incompleteEvaluations` counts runs whose exploration was cut short; when it is set, passing results are inconclusive (human output reads `RESULT: INCONCLUSIVE` and the CLI exits non-zero).

## How Concern Matching Works

```
doc-lint.yaml                  concerns/
signals:                       core/idempotency-boundaries.yaml
  declared:                      triggers:
    - external-api    ──match──>   any_of: [external-api, webhooks, ...]
    - payments        ──match──>   any_of: [..., payments, ...]
    - webhooks
                               interactions/retry-times-payment.yaml
                                 triggers:
    - payments ─────┐              all_of: [payments, retry-policy]
                    │
                    └─ "retry-policy" NOT declared → primary trigger NOT met

                                 alternative_triggers:
    - payments ─────┐              - all_of: [payments, external-api]  ← MATCH
    - external-api ─┘
                                 → interaction loaded via alternative trigger
```

Core concerns use `any_of` (any signal match loads the concern). Interaction matrices use `all_of` (every signal must be present) with optional `alternative_triggers` providing additional activation paths. This prevents noise: interaction matrices only fire when all the interacting domains are actually present in your system.

## Concern Schema Structure

Each bundled concern is a YAML file with a formally-defined structure. This section documents the schema for users who want to understand how concerns work internally.

### Standard Concern

```yaml
concern:
  id: "idempotency-boundaries"   # unique identifier
  version: "1.0"
  name: "Idempotency Boundaries"
  category: "core"               # core | security | operational | compliance | promise-validation | test-coverage
  severity: "error"              # error | warn | note

  description: |
    What this concern checks and why it matters.

triggers:
  any_of:                        # concern loads if ANY of these signals are declared
    - external-api
    - webhooks
    - payments
  escalate_if:                   # optional: signals that increase urgency
    - payments

evaluation:
  question: "..."                # the evaluation task for the LLM
  checklist:                     # optional: sub-tasks for structured evaluation
    - id: "check-1"
      question: "Is X documented?"
  evidence_required:             # defines the JSON output schema for findings
    - field: "component_name"
      type: "string"
      description: "Name of the component"
      required: true
    - field: "idempotency_documented"
      type: "boolean"
      values: [true, false, null]
  failure_condition: |           # defines what constitutes a gap
    idempotency_documented is FALSE or null
  recommendation_template: |     # optional: markdown template for recommendations
    Document the idempotency mechanism for {{component_name}}.

metadata:
  tier: 2                        # evaluation tier (1=foundational, 2=behavioral, 3=structural)
  created: "2025-01"
  last_updated: "2025-06"        # optional
  author: "doc-lint"
  related_concerns:              # optional: cross-references
    - resilience-triad
  recommended_after:             # optional: evaluation ordering hints
    - api-contract-consistency
  references:                    # optional: external reference URLs
    - "https://example.com/idempotency-patterns"
```

### Interaction Matrix

```yaml
interaction:
  id: "retry-times-payment"
  version: "1.0"
  name: "Retry Policy x Payments"
  category: "interaction"
  severity: "error"
  description: |
    What failure modes this interaction creates.

triggers:
  all_of:                        # ALL signals must be present
    - payments
    - retry-policy
  alternative_triggers:          # optional: additional activation paths
    - all_of: [payments, external-api]

failure_modes:                   # specific failure modes to evaluate
  - id: "partial-completion"
    name: "Partial Completion"
    severity: "error"
    description: "..."
    question: "..."              # LLM evaluation question for this mode
    evidence_required:
      - field: "component"
        type: "string"
    failure_examples:
      - "Payment succeeds but fulfillment fails"

evaluation:
  preamble: "..."                # optional context for the evaluator
  combined_question: "..."       # overall evaluation task
  output_format: "..."           # JSON schema specification
  failure_condition: "..."

recommendations:                 # optional: templates keyed by failure mode id
  partial-completion: |
    Document what happens when payment succeeds but fulfillment fails.

metadata:
  tier: null                     # interactions only load with --tier all
  created: "2025-01"
```

## Custom Concerns

Custom user-defined concern schemas are not yet supported. The current version ships with 44 bundled concerns (including 3 interaction matrices) across 7 categories, covering distributed systems, security, operational readiness, compliance, test coverage, and documentation↔code parity patterns. Custom concerns are planned for a future release.

To use a custom evaluation engine with your own prompt logic, implement the `EvaluationEngine` interface (see [Programmatic API](#custom-evaluation-engines) above).

## Limitations

- **Bundled concerns only** — custom concern YAML schemas are not yet supported
- **Anthropic engines only (built-in)** — both built-in engines (`sdk`, `agent`) use the Anthropic API; for other providers implement a custom `EvaluationEngine` via the programmatic API
- **Agent engine (v1) caveats** — its `grep` regex has bounded length/line caps (not full RE2-grade ReDoS safety); symlink escapes out of the sandbox are blocked but a narrow check-then-read race remains (acceptable for a local, trusted working tree); and the agentic path is still handed the inline-assembled prompt (doc content + code map) as a starting point while it reads real source — a pure reference-mode agent path is a planned follow-up
- **Required document roles** — in `doc-first` mode, manifests must include `brd`, `frd`, and `add` roles in `documents.required` (relaxed in `reconcile`/`code-first`)
- **Code map is sampled, not exhaustive** — the code scan uses lightweight, language-agnostic regex/heuristics (no full parse). It may miss multi-line route declarations, dynamically-registered routes, or non-JS/TS languages; drift/parity findings it can't confirm are marked `requiresHumanReview` rather than asserted
- **No `.env` loading** — `ANTHROPIC_API_KEY` must be set as a shell environment variable
- **Tolerance filtering** — only `severity_threshold` actively filters findings; `allow_implicit` and `allow_external_refs` are recorded but not enforced

## License

ISC
