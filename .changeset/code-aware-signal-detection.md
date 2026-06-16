---
"@satoshibits/doc-lint": minor
---

closes the signal-discovery blind spot for stale-doc repos: signals are no longer derived from documentation alone. In reconcile mode, `assemble`/`lint` `auto_detect` now also runs the code-based detector over the static code map and merges the result, so a capability present in the implementation but absent from the docs (e.g. a Stripe integration → `payments`) still surfaces as a signal and triggers its concerns. The `detect` command is now code-aware too — a new `--code <paths>` flag (defaulting to the manifest's `code.paths` in reconcile mode) makes the emitted prompt instruct the external agent to scan the source for signals the docs omit. Docs-only detection is unchanged.
