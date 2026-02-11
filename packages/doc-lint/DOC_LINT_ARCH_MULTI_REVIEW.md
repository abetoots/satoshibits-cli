# Doc-Lint Architecture — Multi-Model Review

**Date**: 2026-02-10
**Package**: `@satoshibits/doc-lint` (`packages/doc-lint/`)
**Review Type**: High-level architecture analysis
**Experts**: Claude Opus 4.6 (Lead), Gemini 3 Pro (via PAL clink), Codex (via Codex MCP)

---

## Executive Summary

All three architecture analysts independently confirm that the core architectural decision — "The Tool, Not The Master" with its two-layer split between deterministic assembly and optional API evaluation — is sound and well-conceived. The `EvaluationEngine` interface is minimal and elegantly extensible. The ESM module strategy is consistent. The dependency graph is acyclic and clean.

However, the review surfaces one high-severity structural violation: the `lint()` function **does not compose** the `assemble()` function, instead duplicating its entire pipeline. This undermines the stated two-layer architecture contractually. Three additional medium-severity concerns around asset resolution, public API breadth, and boundary validation round out the actionable findings.

**Verdict**: Strong foundation with 1 high-severity structural issue requiring attention before the architecture matures.

---

## Consensus Findings

All three experts independently flagged these issues.

### 1. lint() Duplicates the Assembly Pipeline (HIGH)

| Aspect | Detail |
|--------|--------|
| **Severity** | HIGH (Gemini: finding, Codex: Medium, Claude: Critical — resolved as HIGH) |
| **Location** | `src/core/evaluator.ts` — `lint()` lines 67-72 vs `assemble()` lines 32-37 |
| **Confidence** | Unanimous |

**Finding**: The `lint()` function re-executes `loadManifest`, `loadDocuments`, `loadAllConcerns`, `matchConcerns`, and `buildEvaluationPrompt` independently rather than calling `assemble()` and iterating over its output. The `dry-run` code path in `commands/lint.ts:22` already calls `assemble()`, proving the intent — but the primary lint path does not.

**Impact**: Any future change to assembly logic (new prompt types, ordering, metadata) must be mirrored in both functions. The two-layer architecture is aspirational rather than structurally enforced.

**Recommendation**: `lint()` should call `assemble()` internally and iterate over the resulting `prompts` array to feed each to the engine. This eliminates duplication and enforces the layer boundary contractually.

### 2. Fragile Asset Resolution via isInDist (HIGH)

| Aspect | Detail |
|--------|--------|
| **Severity** | HIGH (Gemini: Critical, Codex: Medium, Claude: High — resolved as HIGH) |
| **Location** | `src/core/concerns.ts:15-16`, `src/bin/cli.ts:10-14` |
| **Confidence** | Unanimous |

**Finding**: Runtime discovery of bundled YAML concerns and `package.json` relies on string-matching `__dirname` for the literal `dist` path segment, then using different relative paths depending on the result. This couples runtime behavior to the specific TypeScript compiler output directory structure.

**Impact**: Breaks under alternative build tools (tsup, unbuild), changed `outDir`/`rootDir` layout, or symlinked `node_modules` where a parent path contains `dist`.

**Mitigating context**: This pattern is reused from `create-github-workflows` in the same monorepo, so it's a known convention — not a novel fragility. However, both instances share the same risk.

**Recommendation**: Derive package root from a stable anchor — walk upward to find `package.json`, or resolve relative to `import.meta.url` with a known package-root marker.

### 3. Public API Surface Too Broad (MEDIUM)

| Aspect | Detail |
|--------|--------|
| **Severity** | MEDIUM (Codex: Low, Claude: High — resolved as MEDIUM) |
| **Location** | `src/index.mts` |
| **Confidence** | 2 of 3 explicit, 1 implicit |

**Finding**: The public entry point re-exports 13 value exports and 14 type exports, including low-level functions like `extractJson`, `matchConcerns`, `loadAllConcerns`, and `isConcernSchema`. No distinction exists between primary API (`assemble`, `lint`, `EvaluationEngine`) and advanced/internal building blocks.

**Impact**: Any consumer depending on internals creates implicit stability contracts. Internal refactoring becomes a semver concern. Additionally, the `package.json` `exports` field is a bare string, preventing future sub-path exports.

**Recommendation**: Consider partitioning into primary exports (top-level) and advanced exports (sub-path like `@satoshibits/doc-lint/internals`). Adopt conditional exports map in `package.json`.

### 4. Weak Boundary Validation on YAML Inputs (MEDIUM)

| Aspect | Detail |
|--------|--------|
| **Severity** | MEDIUM (Gemini: recommendation, Codex: Medium, Claude: High — resolved as MEDIUM) |
| **Location** | `src/core/manifest.ts:37-117`, `src/core/concerns.ts:53` |
| **Confidence** | Unanimous |

**Finding**: Manifest validation uses hand-rolled `typeof` checks terminated by `return data as DocLintManifest` — fields not explicitly checked pass through unchecked. Concern YAML loading has **zero** validation: `yaml.load(raw) as ConcernOrInteraction` is a direct cast with no structural verification. A malformed YAML file would silently propagate through the pipeline.

**Mitigating context**: Zod is not a runtime dependency in any of the monorepo's core packages (only appears in template/example files). The manual approach was an implementation decision, not a spec mandate.

**Recommendation**: At minimum, add structural validation to `loadConcernFile()` matching the rigor already present in `validateManifest()`. Adopting a schema validation library (Zod, Valibot) is also a valid option — the spec is silent on the approach.

---

## Debated Items

### D1. Zod / Schema Validation Library Adoption

- **Gemini**: Recommends Zod to replace manual validation
- **Claude Agent**: Recommends Zod or Valibot
- **Codex**: Flags weak validation but doesn't prescribe a library
- **Lead Expert Verdict**: **Open for consideration.** Zod is not a runtime dependency in any core monorepo package (only in template/example files), which was the basis for the manual approach during implementation — but the spec is silent on this. Adopting Zod/Valibot is a valid option. Regardless of the approach, the immediate gap is that concern YAML loading has *no* validation at all — that needs to be addressed either way.

### D2. Hardcoded Document Roles (brd, frd, add)

- **Gemini**: Flags as Medium — "limits the tool's utility to a specific workflow"
- **Codex**: Not flagged
- **Claude Agent**: Not flagged (noted as implicit contract)
- **Lead Expert Verdict**: **Intentional per specification.** This is a domain-specific tool for evaluating architecture documents against concern schemas. The roles are required by the bundled concern schemas. Making them configurable would undermine the opinionated nature of the tool. If future concern schemas require different roles, the validation can be relaxed then.

### D3. Synchronous I/O in Core Functions

- **Claude Agent**: Flags as Medium — blocks event loop for library consumers
- **Gemini**: Not flagged
- **Codex**: Not flagged
- **Lead Expert Verdict**: **Intentional for Phase 2.** `assemble()` is synchronous by design — it's a deterministic pipeline for a CLI tool. The async/sync asymmetry with `lint()` is a natural consequence of the two-layer split (assemble = no I/O beyond disk, lint = network I/O). Converting to async adds complexity with no benefit for the primary CLI use case. Revisit if library consumption from server contexts becomes a real requirement.

### D4. SdkEngine Creates New Client per evaluate() Call

- **Claude Agent**: Flags as Medium — repeated client construction
- **Gemini**: Not flagged
- **Codex**: Not flagged
- **Lead Expert Verdict**: **Valid but LOW impact.** The dynamic `import()` is cached by Node.js module loader. The Anthropic client is a lightweight wrapper. For the typical 3-9 concern evaluations per run, the overhead is negligible. Worth optimizing if performance profiling reveals it as a bottleneck, but not an architectural concern.

### D5. process.exit() in Command Handlers

- **Claude Agent**: Flags as Medium — prevents programmatic use and testing
- **Gemini**: Not flagged
- **Codex**: Not flagged
- **Lead Expert Verdict**: **Valid observation, LOW priority.** The command handlers are CLI-specific entry points, not library APIs. The core `assemble()` and `lint()` functions correctly return data. Moving exit-code logic to `cli.ts` would be cleaner but is not blocking for Phase 2.

---

## Positive Consensus (Strengths)

All three experts highlighted these as architectural strengths:

1. **"The Tool, Not The Master" split** — The fundamental decision to separate deterministic assembly from optional API evaluation is excellent. It builds user trust by enabling audit of exactly what will be sent to the LLM.

2. **EvaluationEngine interface** — Minimal, clean, and composable. Single-method interface (`evaluate(prompt): Promise<Result>`) makes adding new engines trivial. The discriminated union return type (`ok: true/false`) is well-designed.

3. **Dynamic import for SDK isolation** — Using `await import("@anthropic-ai/sdk")` inside `SdkEngine.evaluate()` prevents startup crashes when the SDK isn't installed. Combined with `optionalDependencies`, this is a mature optimization.

4. **Lazy-loaded CLI commands** — Dynamic imports for command handlers keep startup fast and only load what's needed.

5. **Clean dependency graph** — Acyclic, unidirectional flow from CLI -> commands -> core -> types. No circular dependencies. The engine abstraction properly isolates the heavy SDK.

6. **LintInput extends AssembleInput** — Clean composition pattern that enforces consistency between the two pipeline entry points.

---

## Actionable Recommendations

Priority-ordered list of architectural improvements:

| # | Severity | Action | Effort |
|---|----------|--------|--------|
| 1 | HIGH | Refactor `lint()` to call `assemble()` internally, then iterate over `.prompts` | Small |
| 2 | HIGH | Investigate stable asset resolution (package root anchor vs isInDist heuristic) | Medium |
| 3 | MEDIUM | Add structural validation to `loadConcernFile()` for YAML concern schemas | Small |
| 4 | MEDIUM | Partition public API into primary/advanced; adopt conditional exports map | Medium |
| 5 | LOW | Extract `list` command handler into `commands/list.ts` for consistency | Trivial |
| 6 | LOW | Move `process.exit()` from command handlers to `cli.ts` | Small |

---

## Review Metadata

| Expert | Tool | Model | Role |
|--------|------|-------|------|
| Claude (Lead) | Task agent (architecture-analyst) | Claude Opus 4.6 | Architecture Analyst |
| Gemini | PAL clink (codereviewer role) | Gemini 3 Pro Preview | Architecture Analyst |
| Codex | Codex MCP (read-only sandbox) | Codex | Architecture Analyst |

**Consensus methodology**: Each expert analyzed independently with no access to others' findings. Lead Expert validated specific code evidence, resolved severity disagreements, and applied monorepo context to debated items.
