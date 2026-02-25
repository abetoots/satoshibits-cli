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

## When to Use

doc-lint is designed for **architecture documentation suites** (BRD, FRD, ADD) in systems involving distributed services, payment processing, async workflows, or external API integrations. It is most valuable when:

- Your project has 3+ architecture documents that must stay consistent
- Your system touches domains where cross-cutting concerns cause subtle gaps
- You want repeatable, versioned evaluation criteria rather than ad-hoc LLM prompts

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

One of `-f` or `-o` must be provided. If both are given, `-o` takes priority. When `--output-dir` is used, each assembled prompt is written as an individual Markdown file (e.g., `idempotency-boundaries.md`) with YAML front-matter metadata. These files are self-contained and ready to hand off to any external LLM.

### `doc-lint detect [path]`

Generates a self-contained signal detection prompt for LLM handoff. The prompt includes the full signal vocabulary, your project documents, and a JSON response schema. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` or `doc-lint.yml` |
| `-f, --format <format>` | Output format: `human` or `json` (to stdout) | *required if `-o` not set* |
| `-o, --output-dir <path>` | Write `signal-detection.md` to this directory | *required if `-f` not set* |

One of `-f` or `-o` must be provided. If both are given, `-o` takes priority. The output includes the signal vocabulary (closed set), document content, and a JSON response schema with `signals` (id, confidence, rationale) and `unmappedConcepts` fields.

**Workflow:** `detect` -> feed prompt to LLM -> use response to update `signals.declared` in manifest -> `assemble` or `lint`.

### `doc-lint lint [path]`

Assembles prompts and evaluates them via the Anthropic SDK. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `--tier <level>` | **Required.** Tier scope: `1`, `2`, `3`, or `all` | - |
| `--engine <engine>` | Evaluation engine (currently only `sdk`) | `sdk` |
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` or `doc-lint.yml` |
| `-f, --format <format>` | Output format: `human` or `json` | `human` |
| `--no-contradiction` | Skip the contradiction scanner | enabled |
| `--concerns <ids>` | Only specific concerns (comma-separated) | all matched |
| `--dry-run` | Show matched concerns without evaluating | - |
| `--verbose` | Show detailed progress | - |
| `--severity-threshold <level>` | Minimum severity to display: `error`, `warn`, or `note` | all findings |
| `--allow-implicit` | Record that implicit documentation is accepted as coverage | - |
| `--allow-external-refs` | Record that external references are accepted as partial coverage | - |
| `--auto-detect` / `--no-auto-detect` | Auto-detect signals from document content | manifest value or `false` |
| `--warn-on-mismatch` / `--no-warn-on-mismatch` | Warn when detected signals differ from declared | manifest value or `false` |

**Exit codes:** `0` = pass, `1` = errors found, `2` = tool error

**Tolerance flags:** `--severity-threshold` actively filters findings from output. `--allow-implicit` and `--allow-external-refs` are recorded in the result's `toleranceApplied` field for audit purposes but do not currently filter findings.

**Understanding findings:** Each finding has a `severity` (error, warn, note) and a `confidence` (high, medium, low). High-confidence errors are hard blockers. Low-confidence errors are flagged with `requiresHumanReview: true` — they indicate a potential gap that the evaluator could not confirm with certainty.

### `doc-lint list`

Lists all bundled concerns grouped by category (core, promise-validation, security, operational, compliance, test-coverage) with trigger signals, severity, version, and tier assignment. Interaction matrices are shown in a separate section.

## Manifest Reference

The `doc-lint.yaml` (or `doc-lint.yml`) manifest declares your project's documents and signals.

```yaml
version: "1.0"            # manifest schema version

project:
  name: "Project Name"     # required
  description: "Optional"  # optional
  classification: financial # optional: standard | financial | healthcare | infrastructure

documents:
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

doc-lint ships with 28 bundled concerns across 6 categories, plus 3 interaction matrices. Run `doc-lint list` for the full listing with trigger signals.

### Core (7)

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

### Operational (4)

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `alerting-slo-alignment` | Alerting rules are aligned with SLO targets and thresholds | sla, monitoring, observability, alerting |
| `dependency-runbook` | External dependencies have documented runbook procedures for failure scenarios | external-api, third-party, database, message-queue |
| `failure-mode-coverage` | Documented failure modes have corresponding detection, alerting, and recovery procedures | distributed, microservices, external-api, async-workflows |
| `rollback-documentation` | Deployments and migrations have documented rollback procedures | deployment, ci-cd, database-migration, feature-flags |

### Compliance (4)

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `api-versioning-compliance` | API versioning strategy is documented and consistent with backward-compatibility claims | external-api, api-versioning, public-api, backward-compatibility |
| `auth-scheme-compliance` | Authentication schemes follow documented standards and are consistently applied | authentication, oauth, saml, sso, jwt |
| `data-retention-compliance` | Data retention policies are documented with specific timeframes and deletion procedures | pii, gdpr, data-retention, user-data, privacy |
| `logging-pii-compliance` | Logging practices do not leak PII and comply with documented privacy requirements | logging, pii, audit, observability, gdpr |

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

## Programmatic API

```typescript
import { assemble, lint, SdkEngine } from "@satoshibits/doc-lint";
import type { AssembleResult, LintResult } from "@satoshibits/doc-lint";

// assemble prompts (free, no API calls)
const assembled: AssembleResult = assemble({
  projectPath: "./my-project",
  configPath: "doc-lint.yaml",       // optional
  contradiction: true,                // default: true
  filterConcernIds: ["idempotency-boundaries"],  // optional
  tierFilter: 2,                      // 1, 2, 3, or "all" (omit to include all tiers)
  autoDetect: true,                   // optional: merge detected signals with declared
  warnOnMismatch: true,               // optional: report signal drift
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
// { totalFindings: 3, errors: 1, warnings: 2, notes: 0, contradictions: 0, humanReviewRequired: 1 }
console.log(result.coverage);
// { concernsEvaluated: [...], concernsSkipped: [...], concernsExcluded: [...], documentsLoaded: [...], documentsMissing: [...] }
```

### Key Exports

```typescript
// Functions
import { assemble, lint, SdkEngine } from "@satoshibits/doc-lint";

// Input types
import type { AssembleInput, LintInput } from "@satoshibits/doc-lint";

// Result types
import type {
  AssembleResult,
  LintResult,
  Finding,
  ContradictionFinding,
  Severity,
  Confidence,
} from "@satoshibits/doc-lint";

// Engine types (for custom engines)
import type {
  EvaluationEngine,
  EvaluationResult,
} from "@satoshibits/doc-lint";

// Schema and manifest types
import type {
  DocLintManifest,
  DocumentRef,
  ConcernSchema,
  InteractionSchema,
  ConcernOrInteraction,
  LoadedConcern,
  AssembledPrompt,
} from "@satoshibits/doc-lint";
```

### Custom Evaluation Engines

Implement the `EvaluationEngine` interface to use any LLM:

```typescript
import type { EvaluationEngine, AssembledPrompt } from "@satoshibits/doc-lint";

class MyEngine implements EvaluationEngine {
  async evaluate(prompt: AssembledPrompt) {
    const response = await myLlmClient.chat({
      system: prompt.system,
      user: prompt.user,
    });

    return { ok: true, content: response.text };
    // or: { ok: false, error: "rate limited" }
  }
}

const result = await lint({
  projectPath: ".",
  engine: new MyEngine(),
  tierFilter: "all",
});
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

The `LintResult` also includes `toleranceApplied`, `exclusionsApplied`, and `coverage` fields for audit and CI integration.

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

Custom user-defined concern schemas are not yet supported. The current version ships with 28 bundled concerns across 6 categories plus 3 interaction matrices, covering distributed systems, security, operational readiness, compliance, and test coverage patterns. Custom concerns are planned for a future release.

To use a custom evaluation engine with your own prompt logic, implement the `EvaluationEngine` interface (see [Programmatic API](#custom-evaluation-engines) above).

## Limitations

- **Bundled concerns only** — custom concern YAML schemas are not yet supported
- **Anthropic SDK only** — the built-in CLI engine uses the Anthropic API; use the programmatic API with a custom `EvaluationEngine` for other providers
- **Required document roles** — manifests must include `brd`, `frd`, and `add` roles in `documents.required`
- **No `.env` loading** — `ANTHROPIC_API_KEY` must be set as a shell environment variable
- **Tolerance filtering** — only `severity_threshold` actively filters findings; `allow_implicit` and `allow_external_refs` are recorded but not enforced

## License

ISC
