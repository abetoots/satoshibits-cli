---
"@satoshibits/claude-skill-runtime": minor
---

Fix pre-tool guardrail matching, add opt-in user-scope rules, and accept current hook
payload shapes.

**`inputPatterns` guardrails never matched anything.** `RuleMatcher.matchPreToolTriggers`
typed its input as `string`, but Claude Code sends `tool_input` as an object
(`{ command: "rm -rf /" }`). `RegExp.test` coerced that to `"[object Object]"`, so no
`preToolTriggers.inputPatterns` rule could ever fire. It now accepts `unknown` and tests
patterns against each **string leaf value separately**, rather than a JSON dump of the
object: a dump breaks anchored patterns (`^rm ` cannot match a subject beginning `{"`) and
would let key names and JSON escaping match. Serialization is deferred and memoized, so a
large `Write`/`Edit` payload is not walked on every tool call in projects whose rules never
inspect the input. Cycles are guarded.

**User-scope rules (`{ userScope }`, default off).** `ConfigLoader` can also load
`~/.claude/skills/skill-rules.yaml` (resolved via `os.homedir()`) and merge it beneath
project rules: project wins on skill-name collision, and `settings` merge key by key with
project precedence (`scoring`/`thresholds` one level deeper), so a project that sets a
single key no longer discards the user's global preferences.

Content resolution is **scope-isolated**: a skill's `SKILL.md` is only read from the scope
that declared the rule. A project's `skill-rules.yaml` arrives with any cloned repository
and is untrusted data, so a cross-scope search would let it name a user-scope skill and
have the hook read and print a private file out of `$HOME`. Skill names containing path
separators or `..` are rejected. An **unparseable** project config degrades to the empty
default rather than silently inheriting the entire user rule set; an **absent** one still
merges user scope.

**Payload shape.** `initHookContext` accepts `cwd` and resolves
`CLAUDE_PROJECT_DIR ?? cwd ?? workingDirectory ?? process.cwd()`; `resolveHookDir(data)`
reads `cwd` with a `working_directory` fallback. Note this is defensive rather than a fix
for an observed production failure: Claude Code sets `CLAUDE_PROJECT_DIR` when it spawns a
hook (verified against a live invocation), so the payload fields are the fallback path.
They matter for harnesses and tests that invoke hooks directly, and for any invocation
where the variable is absent.
