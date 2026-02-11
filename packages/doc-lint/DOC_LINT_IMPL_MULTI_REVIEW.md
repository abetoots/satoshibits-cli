# Doc-Lint Phase 2 Implementation Review

**Review Type:** Multi-Model Consensus Review
**Models:** Claude Opus 4.6 (Lead), Gemini 3 Pro (Primary), Codex/GPT (Secondary)
**Date:** 2026-02-10
**Scope:** Implementation vs Plan + Spec (`temp/artifacts/claude/doc-lint-spec.md`)

---

## Executive Summary

The doc-lint Phase 2 implementation is **high-quality and functionally complete**. The core "Tool, Not The Master" architecture is faithfully implemented: `assemble` produces free, deterministic prompts while `lint` optionally evaluates via SDK. All 9 bundled concerns load correctly, signal matching works for both `any_of` and `all_of` semantics, and 38 tests pass across 8 test files.

**All 3 models agree** the implementation successfully delivers on the plan's core objectives. Disagreements centered on whether spec-level features deferred by the plan should be flagged as gaps. The lead expert resolved these by distinguishing **plan compliance** (the implementation target) from **spec compliance** (the aspirational design).

**Actionable items found:** 5 bugs/issues to fix, 3 improvements to consider.

---

## Consensus Findings (All 3 Models Agree)

### 1. Architecture and Core Pipeline: PASS

All models confirmed:
- Clean separation of `core/`, `engine/`, `commands/`, `formatters/`, `types/`
- `assemble` → `lint` two-layer architecture works as designed
- `isInDist` pattern correctly resolves bundled YAML assets
- Dynamic `import()` for `@anthropic-ai/sdk` prevents startup crashes
- Response parser is resilient (handles `json` fences, bare fences, brace matching)
- Prompt builder correctly injects full document content (context stuffing)
- Signal matching implements `any_of` (core) and `all_of` + `alternative_triggers` (interaction)

### 2. Concern Loading and Bundling: PASS

All 9 concerns (6 core + 3 interactions) load correctly. The `list` command displays all concerns with their trigger signals and versions.

### 3. Test Coverage: GOOD with gaps

38 tests cover manifest validation, document loading, signal matching, concern loading, prompt building, response parsing, and both formatters. All pass.

**Gaps identified by all models:**
- No tests for `SdkEngine` (even a mock-based test would help)
- No integration test for the `assemble()` or `lint()` orchestrator functions
- No CLI-level tests (command execution, error handling)

---

## Debated Items and Lead Expert Resolution

### D1. Manifest Format: Spec Map vs Implementation Array

| Model | Severity | Position |
|-------|----------|----------|
| Gemini | Critical | Spec uses `brd: "./path"` map; impl uses `[{role: "brd", path: "..."}]` array |
| Codex | High | Same finding — blocks spec-compliant manifests |
| Claude (Lead) | **Intentional — Low** | Plan explicitly chose array format for richer metadata (label field) |

**Resolution:** The **plan** is the implementation target, not the spec directly. The plan's `DocumentRef` type with `role`, `path`, and `label` fields was a deliberate design choice providing extensibility over the spec's concise map format. The spec is the aspirational v0.1 design; the plan evolved it for Phase 2. **Not a bug.** However, supporting both formats (map and array) in a future iteration would be a nice DX improvement.

### D2. Missing Spec Fields (tolerance, auto_detect, classification)

| Model | Severity | Position |
|-------|----------|----------|
| Gemini | High | `tolerance`, `auto_detect`, `warn_on_mismatch` missing |
| Codex | High | Same — blocks hybrid signal detection |
| Claude (Lead) | **Intentional deferral — Not a gap** | Plan explicitly says "Phase 2 uses declared signals only (no LLM auto-detection)" |

**Resolution:** The plan explicitly defers hybrid signal detection, tolerance settings, and project classification to Phase 3+. These were never part of Phase 2 scope. **Not a Phase 2 gap.**

### D3. Output Schema Differences

| Model | Severity | Position |
|-------|----------|----------|
| Codex | High | Output lacks `signals.detected/mismatches`, `concern_version` in findings |
| Gemini | Low | Acceptable but noted |
| Claude (Lead) | **Intentional — Low** | Plan defines its own `AssembleResult`/`LintResult` types |

**Resolution:** The plan's output types are the implementation target. The spec's JSON example is aspirational. The implementation correctly follows the plan's `AssembleResult` and `LintResult` type definitions. **Not a bug.** The `signals.detected/mismatches` fields relate to auto-detection, which is deferred.

---

## Confirmed Issues (Action Required)

### Bug 1: Interaction `triggerSignals` has dead code logic
**Severity:** Low (no functional impact due to Set dedup)
**File:** `src/core/concerns.ts:72`
**Finding:** `const allSignals = [...i.id ? parsed.triggers.all_of : []]` — `i.id` is always truthy (it's a required string), so the ternary always takes the true branch. The entire variable initialization is redundant since `parsed.triggers.all_of` is already merged via the Set on line 79.
**All models:** Codex flagged, Claude confirmed.

### Bug 2: `--engine` CLI option is accepted but ignored
**Severity:** Medium
**File:** `src/commands/lint.ts:36`
**Finding:** The CLI accepts `--engine <engine>` but `lintCommand` always creates `new SdkEngine()` regardless of the option value. Since Phase 2 only has one engine, this should at minimum validate the value is `"sdk"` and error on unknown engines.
**All models:** Codex flagged, Claude confirmed.

### Bug 3: `--dry-run` ignores `--format` option
**Severity:** Low
**File:** `src/commands/lint.ts:30`
**Finding:** When `--dry-run` is used, the command always calls `formatAssembleHuman()` regardless of the `--format` option. Should respect the format flag.
**All models:** Codex flagged, Claude confirmed.

### Bug 4: Contradiction severity not affecting exit code
**Severity:** Medium
**File:** `src/core/evaluator.ts:112-119`, `src/commands/lint.ts:63`
**Finding:** The exit code only considers `result.summary.errors` (from findings), but contradictions with `error` severity are not counted toward the error total. The spec says error-level contradictions (involving availability, payments, etc.) should block sign-off.
**All models:** All three agreed.

### Bug 5: Duplicate import in lint.ts
**Severity:** Low (cosmetic)
**File:** `src/commands/lint.ts:4-5`
**Finding:** `formatAssembleHuman` is imported from `../formatters/human.js` but `formatLintJson` is also imported from `../formatters/json.js` on an adjacent line. Line 4 imports `formatAssembleHuman` from human.ts, and line 6 imports `formatLintHuman` from human.ts — this works but lines 4 and 6 could be a single import statement.
**Found by:** Claude (Lead).

---

## Improvement Recommendations

### R1. Add graceful CLI error handling
**Severity:** Medium
**Finding:** Commands call `process.exit()` directly and don't wrap execution in try/catch. Unhandled exceptions (e.g., invalid YAML in manifest, file permission errors) show raw stack traces instead of user-friendly messages.
**Recommendation:** Wrap command actions in try/catch with chalk-colored error output.

### R2. Make SDK model configurable
**Severity:** Low
**Finding:** `SdkEngine` hardcodes `claude-sonnet-4-5-20250929`. While the plan doesn't specify model configurability, allowing `--model` or a manifest field would improve flexibility.
**Models:** Gemini flagged, Claude concurs as a nice-to-have.

### R3. Public API exports are comprehensive
**Severity:** Positive finding
**Finding:** `src/index.mts` exports `assemble()`, `lint()`, all core functions, all types, and the engine interface. This is correctly positioned for a future MCP wrapper.
**Gemini initially said exports were minimal** — this was incorrect. Claude verified all planned exports are present.

---

## Verification Checklist (from Plan)

| Criteria | Status |
|----------|--------|
| `pnpm build` compiles without errors | PASS |
| `pnpm test` — all unit tests pass | PASS (38/38) |
| `doc-lint list` shows all 9 bundled concerns | PASS |
| `doc-lint --help` shows all commands and options | PASS |
| `doc-lint assemble` with sample project outputs valid JSON | PASS |
| `--no-contradiction` flag works | PASS (5 vs 6 prompts) |
| `--concerns` filter works | PASS |
| Signal matching correctness | PASS |
| Exit codes (0 = pass, 1 = errors, 2 = tool error) | PARTIAL (exit code 2 not implemented) |

---

## Summary

| Category | Count |
|----------|-------|
| Bugs to fix | 5 (2 medium, 3 low) |
| Improvements to consider | 3 |
| Debated items resolved | 3 (all resolved as intentional plan decisions) |
| Tests passing | 38/38 |
| Plan verification criteria met | 8/9 |

**Overall Assessment:** The implementation faithfully executes the Phase 2 plan. The bugs found are minor and don't affect the primary `assemble` workflow (which is the plan's stated core value proposition). The `lint` workflow has a few rough edges (engine selection, contradiction exit codes) that should be addressed before CI usage.
