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
| **Assemble** | `doc-lint assemble` | Free | Loads manifest, matches concerns, builds prompts with full document content |
| **Detect** | `doc-lint detect` | Free | Generates a signal detection prompt for LLM handoff |
| **Lint** | `doc-lint lint` | API calls | Runs assembly, then sends each prompt to an LLM for evaluation |

The assemble layer is the core value. You can inspect exactly what will be sent to the LLM, pipe prompts into your own tooling, or use the `lint` layer for a fully automated flow. The `detect` command generates a standalone prompt that an LLM can use to identify which signals are present in your documentation — useful for bootstrapping or auditing the `signals.declared` list in your manifest.

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

### 1. Create a manifest

Create `doc-lint.yaml` in your project root:

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
# outputs JSON with all assembled prompts
doc-lint assemble . -f json

# human-readable summary
doc-lint assemble . -f human

# write each prompt as a standalone .md file (best for LLM handoff)
doc-lint assemble . -o ./prompts
```

Example human output:

```
doc-lint assemble: My Payment Service
Signals: external-api, payments, webhooks
Matched concerns: 5
  + api-contract-consistency
  + idempotency-boundaries
  + resilience-triad
  + retry-times-payment
  + webhook-times-security
Skipped concerns: 4
  - durable-persistence
  - failure-domain-isolation
  - state-ownership-clarity
  - async-times-approval
Total prompts assembled: 6
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
doc-lint lint .

# with verbose progress
doc-lint lint . --verbose

# dry run — show which concerns matched without calling the API
doc-lint lint . --dry-run
```

## CLI Reference

### `doc-lint assemble [path]`

Assembles evaluation prompts without making any API calls. `[path]` is the project root directory containing `doc-lint.yaml` (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` |
| `-f, --format <format>` | Output format: `human` or `json` (to stdout) | *required if `-o` not set* |
| `-o, --output-dir <path>` | Write each prompt as a standalone `.md` file to this directory | *required if `-f` not set* |
| `--no-contradiction` | Skip the contradiction scanner prompt | enabled |
| `--concerns <ids>` | Only specific concerns (comma-separated) | all matched |
| `--auto-detect` / `--no-auto-detect` | Auto-detect signals from document content | manifest value or `false` |
| `--warn-on-mismatch` / `--no-warn-on-mismatch` | Warn when detected signals differ from declared | manifest value or `false` |

One of `-f` or `-o` must be provided. When `--output-dir` is used, each assembled prompt is written as an individual Markdown file (e.g., `idempotency-boundaries.md`) with YAML front-matter metadata. These files are self-contained and ready to hand off to any external LLM.

### `doc-lint detect [path]`

Generates a self-contained signal detection prompt for LLM handoff. The prompt includes the full signal vocabulary, your project documents, and a JSON response schema. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` |
| `-f, --format <format>` | Output format: `human` or `json` (to stdout) | *required if `-o` not set* |
| `-o, --output-dir <path>` | Write `signal-detection.md` to this directory | *required if `-f` not set* |

One of `-f` or `-o` must be provided. The output includes the signal vocabulary (closed set), document content, and a JSON response schema with `signals` (id, confidence, rationale) and `unmappedConcepts` fields.

**Workflow:** `detect` -> feed prompt to LLM -> use response to update `signals.declared` in manifest -> `assemble` or `lint`.

### `doc-lint lint [path]`

Assembles prompts and evaluates them via the Anthropic SDK. `[path]` is the project root directory (defaults to `.`).

| Option | Description | Default |
|--------|-------------|---------|
| `--engine <engine>` | Evaluation engine (currently only `sdk`) | `sdk` |
| `-c, --config <file>` | Path to manifest file | Auto-detect `doc-lint.yaml` |
| `-f, --format <format>` | Output format: `human` or `json` | `human` |
| `--no-contradiction` | Skip the contradiction scanner | enabled |
| `--concerns <ids>` | Only specific concerns (comma-separated) | all matched |
| `--dry-run` | Show matched concerns without evaluating | - |
| `--verbose` | Show detailed progress | - |
| `--auto-detect` / `--no-auto-detect` | Auto-detect signals from document content | manifest value or `false` |
| `--warn-on-mismatch` / `--no-warn-on-mismatch` | Warn when detected signals differ from declared | manifest value or `false` |

**Exit codes:** `0` = pass, `1` = errors found, `2` = tool error

**Understanding findings:** Each finding has a `severity` (error, warn, note) and a `confidence` (high, medium, low). High-confidence errors are hard blockers. Low-confidence errors are flagged with `requiresHumanReview: true` — they indicate a potential gap that the evaluator could not confirm with certainty.

### `doc-lint list`

Lists all bundled concerns grouped by category (core, promise-validation, security, operational, compliance, test-coverage) with trigger signals and severity.

## Manifest Reference

The `doc-lint.yaml` manifest declares your project's documents and signals.

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

options:                    # optional overrides
  contradiction: false      # disable contradiction scanner
  concerns:                 # restrict to specific concern IDs
    - idempotency-boundaries

tolerance:                  # optional: filter findings by severity
  severity_threshold: warn  # only report findings at this level or above (error, warn, note)
  allow_implicit: false     # optional
  allow_external_refs: true # optional

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
- **Interaction matrices** activate when *all* of their trigger signals match (`all_of`)

Run `doc-lint list` to see available signals for each concern.

#### Signal Auto-Detection

By default, only the `declared` signals in your manifest are used. Two optional settings let doc-lint detect signals from your document content:

| Setting | Effect |
|---------|--------|
| `auto_detect: true` | Scans documents for signal keywords, then **merges** detected signals (high+medium confidence) with declared signals. This expands concern coverage without manual manifest edits. |
| `warn_on_mismatch: true` | Scans documents and **compares** detected signals against declared signals. Reports undeclared signals (found in docs but not declared) and stale signals (declared but not found in docs). Does NOT merge — effective signals remain the declared list. |

Both can be set together: `auto_detect` merges for expanded coverage while `warn_on_mismatch` reports the drift. Settings can be defined in the manifest or overridden per-run with CLI flags (`--auto-detect`, `--warn-on-mismatch`). CLI flags take precedence over manifest values.

## Bundled Concerns

doc-lint ships with 28 bundled concerns across 7 categories. Run `doc-lint list` for the full listing with trigger signals.

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

Interaction matrices activate when *all* trigger signals are present. They check for failure modes that emerge at the intersection of two domains — gaps that pass single-concern review but fail in combination.

| ID | What It Checks | Failure Modes | Triggers (all_of) |
|----|---------------|---------------|-------------------|
| `async-times-approval` | Approval workflows processed asynchronously | duplicate-approval, approval-timeout, orphaned-workflow, race-condition, order-inversion | async-workflows, approval-gates |
| `retry-times-payment` | Payment operations with retry policies | partial-completion, inconsistent-state, refund-ambiguity, timeout-ambiguity | payments, retry-policy, external-api |
| `webhook-times-security` | Webhooks received from external providers | event-spoofing, replay-attack, payload-tampering, timing-attack | webhooks, external-api, payments, security |

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
  autoDetect: true,                   // optional: merge detected signals with declared
  warnOnMismatch: true,               // optional: report signal drift
});

console.log(assembled.prompts.length);   // number of prompts generated
console.log(assembled.concerns.matched); // ["idempotency-boundaries"]
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
const result: LintResult = await lint({
  projectPath: "./my-project",
  engine,
  onProgress: (msg) => console.error(msg),
});

console.log(result.summary);
// { totalFindings: 3, errors: 1, warnings: 2, notes: 0, contradictions: 0, humanReviewRequired: 1 }
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
});
```

### Output Structure

Each finding in the `LintResult` has this shape:

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

Example JSON finding (from `doc-lint lint . -f json`):

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

Contradiction findings have a different structure with `statementA`, `statementB`, `conflictType`, and `explanation` fields.

## How Concern Matching Works

```
doc-lint.yaml                  concerns/
signals:                       core/idempotency-boundaries.yaml
  declared:                      triggers:
    - external-api    ──match──>   any_of: [external-api, webhooks, ...]
    - payments        ──match──>   any_of: [..., payments, ...]
    - webhooks
                               interactions/retry-times-payment.yaml
    - payments ─────┐            triggers:
    - external-api ─┤──match──>    all_of: [payments, retry-policy, external-api]
                    │
                    └─ "retry-policy" NOT declared → interaction NOT loaded
```

Core concerns use `any_of` (any signal match loads the concern). Interaction matrices use `all_of` (every signal must be present). This prevents noise: interaction matrices only fire when all the interacting domains are actually present in your system.

## Custom Concerns

Custom user-defined concern schemas are not yet supported. The current version ships with 28 bundled concerns across 7 categories covering distributed systems, security, operational readiness, compliance, and test coverage patterns. Custom concerns are planned for a future release.

To use a custom evaluation engine with your own prompt logic, implement the `EvaluationEngine` interface (see [Programmatic API](#custom-evaluation-engines) above).

## Limitations

- **Bundled concerns only** — custom concern YAML schemas are not yet supported
- **Anthropic SDK only** — the built-in CLI engine uses the Anthropic API; use the programmatic API with a custom `EvaluationEngine` for other providers
- **Required document roles** — manifests must include `brd`, `frd`, and `add` roles in `documents.required`
- **No `.env` loading** — `ANTHROPIC_API_KEY` must be set as a shell environment variable

## License

ISC
