# @satoshibits/doc-lint

## 1.4.0

### Minor Changes

- 3e79a89: makes the free `assemble` route first-class for "bring your own agent" workflows. The `assemble` CLI now exposes the same `--lens` (`docs`/`code`/`reconcile`), `--mode`, `--code`, and `--no-drift` knobs as `lint`, so the prompts it emits for an external agentic CLI match exactly what `lint` would evaluate — with no doc-lint API calls. In reference mode (`--no-inline`), a `code`/`reconcile` lens or `--mode reconcile` now adds a `## Source code` section and a `codeRoots` array to each prompt so the agent reads the real implementation, not just the docs. The default `docs` lens / inline behavior is unchanged.
- 422e9c5: closes the signal-discovery blind spot for stale-doc repos: signals are no longer derived from documentation alone. In reconcile mode, `assemble`/`lint` `auto_detect` now also runs the code-based detector over the static code map and merges the result, so a capability present in the implementation but absent from the docs (e.g. a Stripe integration → `payments`) still surfaces as a signal and triggers its concerns. The `detect` command is now code-aware too — a new `--code <paths>` flag (defaulting to the manifest's `code.paths` in reconcile mode) makes the emitted prompt instruct the external agent to scan the source for signals the docs omit. Docs-only detection is unchanged.

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
