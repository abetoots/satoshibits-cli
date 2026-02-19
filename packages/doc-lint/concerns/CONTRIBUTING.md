# Contributing Concerns & Interactions to doc-lint

## Philosophy

Doc-lint is a **guided reasoning harness**, not a static linter. Traditional LLM document reviews fail because "ensure traceability and no conflicts" is underspecified — each review round reinvents what counts as a problem using implicit heuristics.

Concerns are **property-based tests for documentation**. Each concern YAML defines a single engineering invariant (e.g., "every trust-boundary operation must document idempotency"). The YAML defines **what** to reason about; the LLM does the reasoning. This separation means correctness criteria are versioned, inspectable, and stable across runs.

Everything is evidence-first: every finding must cite document sections. If a concern can't force the evaluator to produce citations, it needs redesigning.

---

## Concern vs Interaction: Decision Framework

Doc-lint has two schema types. Choosing the wrong one is a common mistake.

### Concern

A concern validates a **single invariant** within one domain. It uses `triggers.any_of` — the concern activates if **any** matching signal is detected.

**Example:** `idempotency-boundaries` fires when the project mentions external APIs, webhooks, payments, or message queues. Any one of these is enough to warrant an idempotency check.

### Interaction

An interaction catches **failure modes at domain intersections** — risks that only exist when two or more domains combine. It uses `triggers.all_of` — **all** signals must be present.

**Example:** `async-times-approval` fires only when the project has both async workflows AND approval gates. The failure modes (duplicate approval processing, approval timeout, orphaned workflows) don't exist if only one domain is present.

### Decision Gate

> **Would this risk exist if only one domain were present?**
>
> - **Yes** → It's a **concern**. Use `triggers.any_of`.
> - **No** → It's an **interaction**. Use `triggers.all_of`.

### Quick Reference

| Property | Concern | Interaction |
|---|---|---|
| Top-level key | `concern:` | `interaction:` |
| Trigger type | `triggers.any_of` (any signal) | `triggers.all_of` (all signals) |
| Evaluates | Single invariant | Cross-domain failure modes |
| Schema section | `evaluation.question` | `failure_modes[]` + `evaluation.combined_question` |
| Subdirectory | `concerns/{category}/` | `concerns/interactions/` |
| Example | `idempotency-boundaries` | `async-times-approval` |

---

## Anatomy of a Concern

Place concerns in `concerns/{category}/your-concern-id.yaml`. Valid categories: `core`, `promise-validation`, `security`, `operational`, `compliance`, `test-coverage`.

**Gold standard:** [`concerns/core/idempotency-boundaries.yaml`](core/idempotency-boundaries.yaml)

### Minimal Required YAML

```yaml
# =============================================================================
# CONCERN: Your Concern Name
# =============================================================================
# 2-3 sentence explanation of what this validates and why it matters.
# =============================================================================

concern:
  id: "your-concern-id"           # kebab-case, unique across all concerns
  version: "1.0"                  # semver — bump on breaking schema changes
  name: "Your Concern Name"      # human-readable title
  category: "core"                # must match the subdirectory name
  severity: "error"               # "error" or "warn"

  description: |
    Plain-English explanation of the invariant being validated.
    What must be true? What are the consequences of violation?

# When to load this concern
triggers:
  any_of:                         # activates if ANY signal matches
    - signal-one                  # use canonical signals from signal-keywords.ts
    - signal-two
    - signal-three

# The reasoning task
evaluation:
  # Multi-step evaluation question — this is what the LLM executes
  question: |
    STEP 1: IDENTIFY relevant entities
    Scan documents for [what to look for].

    STEP 2: FOR EACH entity, DETERMINE
    a) [First analysis dimension]
    b) [Second analysis dimension]
    c) [Third analysis dimension]

    STEP 3: FLAG GAPS
    [What constitutes a gap and how to report it]

  # Structured output — every finding must have these fields
  evidence_required:
    - field: "entity_name"
      type: "string"
      description: "What was found"
      required: true

    - field: "your_boolean_check"
      type: "boolean"
      description: "Is the invariant satisfied?"
      required: true

    - field: "mechanism"
      type: "string | null"
      description: "How is the invariant enforced?"
      required: true

    - field: "source_location"        # ALWAYS required
      type: "string"
      description: "Exact location (e.g., 'ADD Section 4.2, paragraph 3')"
      required: true

    - field: "confidence"             # ALWAYS required
      type: "enum"
      values: ["high", "medium", "low"]
      description: "Assessment confidence"
      required: true

  # Testable failure predicates — reference evidence field names directly
  failure_condition: |
    Report as ERROR when:
    1. `your_boolean_check` is FALSE for any [entity type]
    2. `mechanism` is NULL or contains vague language

    Report as WARNING when:
    1. [Lower-severity condition tied to specific field values]
```

### Optional Fields

```yaml
triggers:
  escalate_if:                    # boost severity when these signals also present
    - payments
    - pii

evaluation:
  checklist:                      # sub-questions for completeness
    - id: "check-one"
      question: "For each X, is Y documented?"

  recommendation_template: |      # template for actionable fix suggestions
    ## Gap: {entity_name} - Missing Documentation
    **Location:** {source_location}
    ### Required Documentation
    [What to add]

examples:                         # help the LLM calibrate
  well_documented:
    - source: "ADD Section 5.2"
      text: |
        [Example of good documentation]
      assessment: |
        [How evidence fields should be filled]

  poorly_documented:
    - source: "ADD Section 4.1"
      text: |
        [Example of bad documentation]
      assessment: |
        [How evidence fields should be filled, showing the gap]

metadata:
  created: "2026-02"
  last_updated: "2026-02"
  author: "Your Name"
  references:
    - "Link to relevant standard or resource"
```

---

## Anatomy of an Interaction

Place interactions in `concerns/interactions/your-interaction-id.yaml`.

**Gold standard:** [`concerns/interactions/async-times-approval.yaml`](interactions/async-times-approval.yaml)

### Minimal Required YAML

```yaml
# =============================================================================
# INTERACTION MATRIX: Domain A x Domain B
# =============================================================================
# What failure modes emerge when these domains combine?
# =============================================================================

interaction:
  id: "domain-a-times-domain-b"   # convention: "x-times-y" naming
  version: "1.0"
  name: "Domain A x Domain B"
  category: "interaction"         # always "interaction"
  severity: "error"

  description: |
    What cross-domain failure modes emerge and why they don't exist
    when either domain is present alone.

triggers:
  all_of:                         # ALL signals must be present
    - domain-a-signal
    - domain-b-signal

  alternative_triggers:           # equivalent signal combinations
    - all_of: [alternate-signal-a, alternate-signal-b]

# Each distinct failure mode at the domain intersection
failure_modes:
  - id: "failure-mode-one"
    name: "Descriptive Failure Name"
    severity: "error"             # per-mode severity

    description: |
      What goes wrong and concrete consequences.

    question: |
      Is there documentation addressing [specific failure mode]?
      Specifically:
      1. [Concrete sub-question]
      2. [Concrete sub-question]
      3. [Concrete sub-question]

    evidence_required:
      - field: "detection_mechanism"
        type: "string | null"
      - field: "handling_behavior"
        type: "string | null"
      - field: "source_location"
        type: "string | null"

    failure_examples:
      - "Concrete scenario showing how this goes wrong."

# Combined evaluation across all failure modes
evaluation:
  preamble: |
    Context for the evaluator. Explain why these failure modes don't exist
    when reviewing each domain separately.

  combined_question: |
    Given the documented system uses both [Domain A] and [Domain B],
    evaluate whether the following failure modes are addressed:

    1. FAILURE MODE ONE: [question]
    2. FAILURE MODE TWO: [question]

    For each failure mode:
    - State whether it is ADDRESSED, PARTIALLY ADDRESSED, or NOT ADDRESSED
    - Cite the specific documentation location
    - If not addressed, explain the risk

  output_format: |
    {
      "interaction_id": "domain-a-times-domain-b",
      "overall_assessment": "pass | partial | fail",
      "failure_modes": [
        {
          "id": "failure-mode-one",
          "status": "addressed | partial | not-addressed",
          "evidence": { ... },
          "risk_if_unaddressed": "string"
        }
      ],
      "gaps": [ ... ]
    }

  failure_condition: |
    Report as ERROR when:
    - "failure-mode-one" is not-addressed (explain concrete risk)

    Report as WARNING when:
    - Any failure mode is "partial"
```

### Optional Fields

```yaml
recommendations:                  # fix templates keyed by failure mode
  failure_mode_one: |
    ## Document: [Fix Title]
    Add to ADD/FRD:
    ```
    ### [Section Title]
    [Template for what to document]
    ```

metadata:
  created: "2026-02"
  last_updated: "2026-02"
  author: "Your Name"
  related_concerns:
    - "idempotency-boundaries"    # concerns that overlap
  references:
    - "Relevant book, paper, or standard"
```

---

## Writing Effective Evaluation Questions

The `evaluation.question` is the most important field. It's the reasoning task the LLM will execute against the project's documentation.

### Do: Multi-Step Tasking

Structure questions as sequential tasks that build on each other:

```yaml
# GOOD: forces systematic reasoning
question: |
  STEP 1: IDENTIFY TRUST-BOUNDARY OPERATIONS
  Scan all documents for operations that call external APIs,
  handle webhooks, write to databases, or publish messages.

  STEP 2: FOR EACH OPERATION, DETERMINE
  a) Is idempotency explicitly mentioned?
  b) What mechanism is documented?
  c) What happens on duplicate?

  STEP 3: IDENTIFY RETRY SOURCES
  For each operation, identify ALL sources that could cause re-execution.

  STEP 4: FLAG GAPS
  Any operation where idempotency is implicit or undocumented is a gap.
```

### Do: Use "For Each X, Determine Y" Language

This forces per-entity analysis instead of vague summarization:

```yaml
# GOOD: entity-level analysis
"For each external API call, determine whether retry behavior
 is documented with idempotency guarantees."
```

### Do: Include Causal Prompts

Push the evaluator to reason about causes and consequences:

```yaml
# GOOD: causal reasoning
"What causes re-execution of this operation?"
"What happens under partial failure?"
"Calculate worst-case retry multiplication."
```

### Don't: Keyword Matching

```yaml
# BAD: presence check, not reasoning
question: "Does the documentation mention idempotency?"
```

### Don't: Vibe Checks

```yaml
# BAD: subjective, no structured evidence possible
question: "Is the error handling well-designed?"
```

### Don't: Yes/No Questions

```yaml
# BAD: no analysis, binary output
question: "Are there security measures in place?"
```

---

## Defining Evidence Fields

Evidence fields define the structured output the evaluator must produce. Well-designed evidence fields make failure conditions testable.

### Rules

1. **Always include `source_location`** — forces citation. For concerns, use `type: "string"` with `required: true`. For interaction failure modes, use `type: "string | null"` since a failure mode may not be addressed anywhere in the documentation.
2. **For concerns, always include `confidence`** (type: `enum`, values: `[high, medium, low]`, required: true) — enables severity modulation per the evaluation template's confidence matrix. For interactions, `confidence` is optional on per-failure-mode evidence since the combined evaluation produces an overall assessment.
3. **Use typed, decision-useful fields:**
   - `boolean` for pass/fail checks: `"idempotency_documented": true/false`
   - `enum` for constrained choices: `"duplicate_behavior": "return-cached-response" | "reject-with-error" | ...`
   - `string | null` when absence is meaningful: `"mechanism": "client-provided key" | null`
   - `array` for multi-value fields: `"retry_sources": ["client retry", "LB retry"]`
4. **Mark `required: true`** for fields needed in failure conditions
5. **Add `description`** for every non-obvious field
6. **Add `values`** for enum fields, **`examples`** for free-form fields

### Example

```yaml
evidence_required:
  - field: "operation_name"
    type: "string"
    description: "Name of the operation (e.g., 'PaymentWebhook.handleEvent')"
    required: true

  - field: "idempotency_documented"
    type: "boolean"
    description: "Is idempotency explicitly documented for this operation?"
    required: true

  - field: "idempotency_mechanism"
    type: "string | null"
    description: "The documented mechanism (null if undocumented)"
    required: true

  - field: "duplicate_behavior"
    type: "enum | null"
    values:
      - "return-cached-response"
      - "reject-with-error"
      - "silently-ignore"
      - null
    description: "What happens on duplicate request"
    required: true

  - field: "source_location"
    type: "string"
    description: "Exact location (e.g., 'ADD Section 4.2, paragraph 3')"
    required: true

  - field: "confidence"
    type: "enum"
    values: ["high", "medium", "low"]
    required: true
```

---

## Writing Failure Conditions

Failure conditions determine when findings become errors or warnings. They must be **testable predicates**, not prose judgments.

### Rules

1. **Reference evidence field names directly** — the reader should be able to look at the evidence and mechanically determine pass/fail
2. **Split ERROR vs WARNING** — each threshold tied to a concrete risk
3. **Ban vague language** — if you can't rewrite the condition as a field-level predicate, the evidence schema is missing a field

### Good

```yaml
failure_condition: |
  Report as ERROR when ANY of the following are true:
  1. `idempotency_documented` is FALSE for any trust-boundary operation
  2. `idempotency_mechanism` is NULL or contains only vague language
     like "will be handled" without specifics
  3. `duplicate_behavior` is NULL or "undefined" for operations
     involving payments or approval workflows

  Report as WARNING when:
  1. `idempotency_window` is not specified for time-sensitive operations
  2. `duplicate_behavior` is "silently-ignore" without justification
```

### Bad

```yaml
# BAD: vague, not tied to evidence fields
failure_condition: |
  Report as ERROR when idempotency is not adequately addressed.
  Report as WARNING when documentation could be improved.
```

---

## Choosing Trigger Signals

Triggers determine when your concern is loaded for evaluation. All trigger signals should come from the canonical vocabulary in `src/core/signal-keywords.ts` (currently ~89 signals).

### For Concerns (`any_of`)

Use broad enough triggers for good recall. Most bundled concerns have 4-7 triggers:

```yaml
# idempotency-boundaries uses 7 signals — any one is sufficient
triggers:
  any_of:
    - external-api
    - webhooks
    - payments
    - async-workflows
    - message-queue
    - event-driven
    - distributed
```

### For Interactions (`all_of`)

Use strict triggers to avoid false activation. Use 2-3 signals:

```yaml
# async-times-approval requires BOTH signals
triggers:
  all_of:
    - async-workflows
    - approval-gates
```

Use `alternative_triggers` when different signals express the same precondition:

```yaml
alternative_triggers:
  - all_of: [message-queue, authorization]
  - all_of: [event-driven, workflow-approval]
```

### Finding New Signal Candidates

Signals marked with `// no bundled concern yet` in `signal-keywords.ts` are candidates for new concerns:

- `caching`
- `containerization`
- `iac`
- `kubernetes`
- `websocket`

If your concern needs a signal that doesn't exist, add it to `signal-keywords.ts` with appropriate keywords before creating the concern YAML.

---

## Anti-Patterns

### 1. "Vibe Check" Concern

```yaml
# BAD: vague question, no structured evidence
question: "Is the system well-designed for reliability?"
evidence_required:
  - field: "assessment"
    type: "string"
```

**Fix:** Identify the specific invariant. What must be true? For each entity of type X, what property must hold?

### 2. "Keyword Check" Concern

```yaml
# BAD: presence check, not reasoning
question: "Does the documentation mention circuit breakers?"
evidence_required:
  - field: "mentioned"
    type: "boolean"
```

**Fix:** Ask what the circuit breaker protects, what thresholds are configured, what happens when it opens.

### 3. Overlapping Concern

Before creating a concern, check the 28 existing ones. Run `doc-lint list` to see all loaded concerns. If your invariant is already covered, consider extending the existing concern instead.

### 4. Too-Broad Concern

```yaml
# BAD: tries to validate everything
concern:
  id: "system-design-quality"
  name: "Overall System Design Quality"
```

**Fix:** Split into specific invariants. "Idempotency at trust boundaries" not "good system design."

### 5. Misclassified Type

**Concern that should be an interaction:** If your concern's evaluation question says "when X AND Y are both present," it's an interaction.

**Interaction that should be a concern:** If removing one signal domain doesn't eliminate the risk, it's a concern.

### 6. Non-Canonical Trigger Signals

```yaml
# BAD: invented signal not in signal-keywords.ts
triggers:
  any_of:
    - my-custom-signal
```

**Fix:** Use signals from `signal-keywords.ts`. If none fit, add a new signal entry with keywords first.

### 7. Untestable Failure Conditions

```yaml
# BAD: can't be verified against evidence fields
failure_condition: "Report as ERROR when documentation is insufficient."
```

**Fix:** Reference specific evidence field names and values: "`mechanism` is NULL for any entity where `is_critical` is TRUE."

---

## Checklist Before Submitting

1. **Place YAML in correct subdirectory** — `concerns/{category}/your-id.yaml` for concerns, `concerns/interactions/your-id.yaml` for interactions

2. **Run tests** — update the concern count in `tests/core/concerns.test.ts`:
   ```bash
   pnpm --filter doc-lint test
   ```
   The `"loads all bundled concerns"` test asserts the total count (currently 28) and the concern/interaction split (currently 25 concerns, 3 interactions). Update these expected numbers.

3. **Run build** — ensure no TypeScript errors:
   ```bash
   pnpm --filter doc-lint build
   ```

4. **Run `doc-lint list`** — verify your concern appears with correct metadata

5. **Run against a test project** — assemble a prompt and check the output:
   ```bash
   doc-lint assemble --concerns <your-id> -f human
   ```

6. **Verify trigger behavior:**
   - Does it trigger on projects with the right signals?
   - Does it NOT trigger on unrelated projects?

7. **Mental test cases** — articulate one "should trigger" and one "should NOT trigger" scenario before submitting

---

## TypeScript Schema Reference

The TypeScript types in `src/types/concerns.ts` define the canonical schema shape. Key interfaces:

- **`ConcernSchema`** — top-level key `concern`, triggers use `any_of`, evaluation has `question` + `evidence_required` + `failure_condition`
- **`InteractionSchema`** — top-level key `interaction`, triggers use `all_of`, has `failure_modes[]`, evaluation has `preamble` + `combined_question` + `output_format` + `failure_condition`
- **`EvidenceField`** — `{ field, type, description?, required?, values?, examples? }`. The `type` field is a descriptive string hint for the LLM — it may use union syntax (e.g., `"string | null"`) even though the TS type is `string`. The `required` property is optional (`boolean | undefined`) and instructs the evaluator whether the output field must be non-null.
- **`FailureMode`** — `{ id, name, severity, description, question, evidence_required, failure_examples }`
- **`ChecklistItem`** — `{ id, question }`

**Validation scope:** The loader in `src/core/concerns.ts` validates core metadata (`id`, `version`, `name`, `severity`) and trigger arrays on startup. The full structure of `evaluation`, `failure_modes`, and `evidence_required` is enforced by convention and review — the loader does not deep-validate these sections. Following the skeletons in this guide ensures your concern will work correctly at evaluation time.

The loader scans these subdirectories: `core`, `interactions`, `promise-validation`, `security`, `operational`, `compliance`, `test-coverage`.

## Evaluation Template

When a concern is assembled into a prompt, it's injected into `concerns/templates/evaluation.md`. The template:
1. Presents the concern YAML in Section A
2. Presents project documents in Section B
3. Instructs the LLM to parse the schema, execute the evaluation, identify gaps, and produce structured JSON output

Your concern YAML must be self-contained — the template provides the evaluation framework, but your YAML must define the complete reasoning task.
