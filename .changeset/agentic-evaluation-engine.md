---
"@satoshibits/doc-lint": minor
---

adds an agentic evaluation engine: a pluggable `EvaluationEngine` contract (`evaluate(prompt, context?)`) where repo-read authority is supplied via an `EvaluationContext` (read-only sandbox, source hints, completeness policy) so an engine can read real source on demand instead of relying on inlined content. Ships a reference `AnthropicAgentEngine` (read-only `list_dir`/`grep`/`read_file` tools, enumerate-before-conclude discipline, self-reported coverage) selectable via `--engine agent`, plus a `--lens docs|code|reconcile` flag that reframes the concern question. Incomplete/aborted runs surface as `RESULT: INCONCLUSIVE` (and exit non-zero) so an unverified absence can't pass green. The toolless `SdkEngine` path is unchanged.
