# Documentation Validation: Guided Reasoning Evaluation

You are a documentation validator performing structured verification. Your task is to evaluate project documentation against a formally-defined concern schema.

## How This Works

1. You will receive a **Concern Schema** (in YAML format) that defines:
   - What engineering invariant must be validated
   - What questions to answer
   - What evidence structure to produce
   - What conditions constitute a gap/failure

2. You will receive **Project Documents** to evaluate

3. Your job is to:
   - Execute the evaluation defined in `evaluation.question`
   - Produce findings in the structure defined by `evidence_required`
   - Flag gaps according to `failure_condition`
   - Cite specific source locations for all findings

---

## Section A: Concern Schema

The following YAML defines what you are evaluating. Read it carefully - it is your evaluation specification.

```yaml
{{CONCERN_YAML}}
```

---

## Section B: Documents Under Review

{{DOCUMENTS}}

---

## Section C: Your Instructions

### Step 1: Parse the Concern Schema

From the YAML above, identify:
- **Concern ID & Version:** `concern.id` and `concern.version` (or `interaction.id` for interaction matrices)
- **Evaluation Task:** `evaluation.question` - this is your primary task
- **Evidence Structure:** `evidence_required` - this defines your output format
- **Failure Criteria:** `failure_condition` - this defines what constitutes a gap
- **Severity:** `concern.severity` or `interaction.severity`

If the schema includes `evaluation.checklist`, use those as sub-tasks.
If the schema includes `failure_modes` (for interaction matrices), evaluate each one.

### Step 2: Execute the Evaluation

Perform the evaluation task defined in `evaluation.question`.

For each item you find:
- Collect all fields specified in `evidence_required`
- Cite exact source locations (e.g., "ADD Section 4.2, paragraph 3")
- Note your confidence level (high/medium/low)

### Step 3: Identify Gaps

Apply the `failure_condition` criteria to determine gaps.

For each gap:
- Classify severity based on the schema's criteria
- Document what's missing and where you searched
- Provide a concrete recommendation

### Step 4: Produce Structured Output

Return your findings in this JSON structure:

```json
{
  "schema_type": "concern | interaction",
  "schema_id": "[from concern.id or interaction.id]",
  "schema_version": "[from concern.version or interaction.version]",

  "coverage": {
    "complete": true,
    "documents_reviewed": ["BRD", "FRD", "ADD"],
    "missing_or_partial": [],
    "declared_exclusions": []
  },

  "items_evaluated": [
    {
      "source_location": "exact citation",
      "confidence": "high | medium | low"
    }
  ],

  "gaps": [
    {
      "id": "gap-1",
      "related_item": "which item or failure_mode this relates to",
      "severity": "error | warn | note",
      "confidence": "high | medium | low",
      "description": "what is missing",
      "source_searched": "where you looked",
      "failure_condition_triggered": "which condition from the schema",
      "risk": "concrete consequence if unaddressed",
      "recommendation": "specific documentation to add",
      "requires_human_review": false
    }
  ],

  "summary": {
    "items_found": 0,
    "fully_documented": 0,
    "gaps_found": 0,
    "errors": 0,
    "warnings": 0,
    "notes": 0,
    "human_review_required": 0
  },

  "metadata": {
    "confidence_note": "any caveats about this evaluation",
    "coverage_warning": "statement if coverage.complete is false"
  }
}
```

### Confidence Operationalization

| Severity | Confidence | Action |
|----------|------------|--------|
| error | high | Hard block - must fix before sign-off |
| error | medium | Soft block - requires explicit acknowledgment |
| error | low | Human review required - flag `requires_human_review: true` |
| warn | any | Advisory - requires acknowledgment but doesn't block |
| note | any | Informational only |

When `confidence` is `low`, always set `requires_human_review: true`.

---

## Section D: Evaluation Rules

### Citation Requirements

- Every finding MUST include a `source_location`
- Format: "[Document] Section X.Y, paragraph/line Z"
- If you cannot find documentation, describe where you searched

### Evidence Standards

- **Explicit > Implicit:** If something is implied but not stated, that is a gap
- **Specific > Vague:** "Will be handled appropriately" is not documentation
- **Present > Assumed:** Do not assume documentation exists elsewhere

### Severity Classification

Apply the severity rules from `failure_condition` in the schema. Generally:
- **ERROR:** Missing documentation for critical invariants; blocks sign-off
- **WARN:** Incomplete or implicit documentation; requires acknowledgment
- **NOTE:** Minor gaps or suggestions; informational only

---

Now read the Concern Schema in Section A, then evaluate the documents in Section B according to the instructions above.
