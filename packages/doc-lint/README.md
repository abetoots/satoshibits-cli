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
| **Lint** | `doc-lint lint` | API calls | Runs assembly, then sends each prompt to an LLM for evaluation |

The assemble layer is the core value. You can inspect exactly what will be sent to the LLM, pipe prompts into your own tooling, or use the `lint` layer for a fully automated flow.

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
doc-lint assemble .

# human-readable summary
doc-lint assemble . -f human
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

### 3. Run full lint (requires Anthropic API key)

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
| `-f, --format <format>` | Output format: `human` or `json` | `json` |
| `--no-contradiction` | Skip the contradiction scanner prompt | enabled |
| `--concerns <ids>` | Only specific concerns (comma-separated) | all matched |

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

**Exit codes:** `0` = pass, `1` = errors found, `2` = tool error

**Understanding findings:** Each finding has a `severity` (error, warn, note) and a `confidence` (high, medium, low). High-confidence errors are hard blockers. Low-confidence errors are flagged with `requiresHumanReview: true` — they indicate a potential gap that the evaluator could not confirm with certainty.

### `doc-lint list`

Lists all bundled concerns with their trigger signals.

## Manifest Reference

The `doc-lint.yaml` manifest declares your project's documents and signals.

```yaml
version: "1.0"            # manifest schema version

project:
  name: "Project Name"     # required
  description: "Optional"  # optional

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

signals:
  declared:                 # determines which concerns activate
    - external-api
    - payments
    - webhooks

options:                    # optional overrides
  contradiction: false      # disable contradiction scanner
  concerns:                 # restrict to specific concern IDs
    - idempotency-boundaries
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

## Bundled Concerns

### Core Concerns (6)

Each core concern activates when *any* of its trigger signals match your declared signals.

| ID | What It Checks | Triggers (any_of) |
|----|---------------|--------------------|
| `idempotency-boundaries` | Every trust-boundary operation (API call, webhook, DB write) documents its idempotency mechanism, duplicate behavior, and idempotency window | external-api, webhooks, payments, async-workflows, message-queue, event-driven, distributed |
| `api-contract-consistency` | FRD/ADD claims about endpoints, error codes, auth schemes, and required fields match the actual API specification | external-api, rest-api, graphql, async-api, webhooks |
| `resilience-triad` | Every external dependency has documented timeout, retry policy, AND circuit breaker — and validates coherence: `total_timeout >= retry_count * per_attempt_timeout` | external-api, external-dependency, microservices, distributed |
| `durable-persistence` | Long-running processes have documented resume/checkpoint points and crash recovery behavior | async-workflows, long-running, orchestration, durable-execution, batch-processing, saga |
| `failure-domain-isolation` | Each component declares its failure blast radius, propagation mode (sync/async), and containment mechanism | microservices, distributed, multi-component, event-driven |
| `state-ownership-clarity` | Every cross-boundary state has a declared owner, write access model, and conflict resolution strategy | microservices, distributed, async-workflows, event-driven, message-queue |

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
});

console.log(assembled.prompts.length);  // number of prompts generated
console.log(assembled.concerns.matched); // ["idempotency-boundaries"]

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

Custom user-defined concern schemas are not yet supported. The current version ships with 9 bundled concerns covering common distributed systems patterns. Custom concerns are planned for a future release.

To use a custom evaluation engine with your own prompt logic, implement the `EvaluationEngine` interface (see [Programmatic API](#custom-evaluation-engines) above).

## Limitations

- **Bundled concerns only** — custom concern YAML schemas are not yet supported
- **Anthropic SDK only** — the built-in CLI engine uses the Anthropic API; use the programmatic API with a custom `EvaluationEngine` for other providers
- **Required document roles** — manifests must include `brd`, `frd`, and `add` roles in `documents.required`
- **No `.env` loading** — `ANTHROPIC_API_KEY` must be set as a shell environment variable

## License

ISC
