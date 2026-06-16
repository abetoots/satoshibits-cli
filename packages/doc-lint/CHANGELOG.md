# @satoshibits/doc-lint

## 1.3.0

### Minor Changes

- fd68c66: adds an agentic evaluation engine: a pluggable `EvaluationEngine` contract (`evaluate(prompt, context?)`) where repo-read authority is supplied via an `EvaluationContext` (read-only sandbox, source hints, completeness policy) so an engine can read real source on demand instead of relying on inlined content. Ships a reference `AnthropicAgentEngine` (read-only `list_dir`/`grep`/`read_file` tools, enumerate-before-conclude discipline, self-reported coverage) selectable via `--engine agent`, plus a `--lens docs|code|reconcile` flag that reframes the concern question. Incomplete/aborted runs surface as `RESULT: INCONCLUSIVE` (and exit non-zero) so an unverified absence can't pass green. The toolless `SdkEngine` path is unchanged.

## 1.2.0

### Minor Changes

- bb7b929: adds code-aware support: a reconcile mode with a documentation↔code drift scanner, a code-first bootstrap on-ramp (deterministic as-built scaffolds plus a documentation gap inventory), a `scan` command backed by a static code map, and new concerns including code-vs-doc parity

## 1.1.1

### Patch Changes

- 5c54529: adds cumulative tier filtering and tier-aware prompts

## 1.1.0

### Minor Changes

- 2b28891: adds new operational, security, and core concerns

## 1.0.1

### Patch Changes

- abc3b01: add reference mode to output prompts with file paths

## 1.0.0

### Major Changes

- 3c11c71: init release
