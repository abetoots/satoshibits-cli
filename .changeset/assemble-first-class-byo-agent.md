---
"@satoshibits/doc-lint": minor
---

makes the free `assemble` route first-class for "bring your own agent" workflows. The `assemble` CLI now exposes the same `--lens` (`docs`/`code`/`reconcile`), `--mode`, `--code`, and `--no-drift` knobs as `lint`, so the prompts it emits for an external agentic CLI match exactly what `lint` would evaluate — with no doc-lint API calls. In reference mode (`--no-inline`), a `code`/`reconcile` lens or `--mode reconcile` now adds a `## Source code` section and a `codeRoots` array to each prompt so the agent reads the real implementation, not just the docs. The default `docs` lens / inline behavior is unchanged.
