# @satoshibits/create-auto-loading-claude-skills

## 2.0.0

### Major Changes

- 73f229a: Make `validate` catch broken rules, and switch on the pre-tool guardrails that never fired.

  **BREAKING — `validate` now fails on errors.** It previously printed problems and always
  exited 0, so it could never gate a commit or CI job. Three previously-ignored mistakes are
  now errors: missing required fields (`type`, `enforcement`, `priority`, `description`), an
  `activationStrategy` outside the enum, and (as warnings) unknown fields. Each of these
  silently disabled the skill at runtime — an unrecognized `activationStrategy` falls through
  to `native_only`, and a rule missing required fields is scored but never displayed. A config
  that "passed" before may now fail; that is the point. `validate --fix` exits non-zero when
  errors remain, based on **what auto-fix actually repaired** — its prompts are interactive,
  so with stdin closed (any CI runner) they abort and nothing is fixed. It also registers the
  `-v, --verbose` flag it had always advertised but never defined; passing it previously
  failed as an unknown option.

  **Guardrails that never fired now can.** Note `init` registers only `UserPromptSubmit`,
  `PostToolUse` and `Stop` hooks — not `PreToolUse` or `SessionStart` — so neither validator
  template nor `session-start` runs in a default install; wire them into `settings.json`
  manually to use `preToolTriggers` or session-start context. Both `PreToolUse` templates
  typed `tool_input` as `string`; Claude Code sends an object, so every `inputPatterns` rule silently matched
  nothing. They now pass it through as `unknown` (see the runtime changelog for the matching
  semantics). **If you have `preToolTriggers.inputPatterns` rules, they will begin matching
  for the first time** — review them before upgrading. Patterns are tested against each string
  field of the tool input, so a pattern may now also match non-command fields such as Claude's
  own `description`.

  **User-scope rules.** All seven hook templates opt into the runtime's `userScope`, so
  personal skills in `~/.claude/skills` participate in every hook rather than only prompt
  activation — enabling it on the activation hooks alone would surface a user-level guardrail
  as a suggestion that never actually fired at `PreToolUse`. Content stays scope-isolated: a
  project config cannot cause a user-scope `SKILL.md` to be read.

  **BREAKING — `sync` no longer copies personal skills into a project config.** Running
  `sync` inside a project previously wrote your `~/.claude/skills` rules into that project's
  `skill-rules.yaml`. With scope-isolated content resolution those copies are unusable — they
  point at `<project>/.claude/skills/<name>/SKILL.md`, which does not exist — and because
  project rules win collisions they also shadow the working user-scope entry, so
  `sync && validate` would report an orphaned-skill error for every personal skill. Sync
  personal skills from your home directory instead (`cd ~ && cl-auto-skills sync`), which
  writes `~/.claude/skills/skill-rules.yaml` where the runtime can resolve them.
  `sync-status` applies the same scope rule, so it no longer reports "stale" immediately
  after a clean sync.

  **BREAKING — `sync` reads project skills from `.claude/skills/`, not `.claude/commands/`.**
  It previously scanned only `.claude/commands/`, while `init`, `validate` and the runtime
  all resolve `.claude/skills/<name>/SKILL.md` — so a skill authored in the documented
  location was invisible to `sync`, and one authored under `commands/` synced into a rule
  that `validate` reported as orphaned and the runtime could never load. `sync` now reads
  `.claude/skills/` and prints a notice if it finds `SKILL.md` files left under
  `commands/`; move them to `.claude/skills/<name>/SKILL.md`.

  **Migration:** `sync` now removes entries it previously wrote whose `SKILL.md` no longer
  exists — including personal skills an older release copied into a project config. Without
  this, deleting your last skill left the config permanently stale with no way to repair it,
  and the stale personal copies kept shadowing the real user-scope skills.

  **`validate --fix` gains `-y, --yes`** to apply repairs unattended. Without it, `--fix` on
  a non-TTY stdin now refuses and exits non-zero rather than aborting inside the prompt and
  exiting 0 having repaired nothing. A run that fully repairs the config exits 0. A `skills:`
  block that is not a mapping is reported as an error and `--fix` refuses to touch the file,
  rather than rewriting it and discarding the malformed block.

  The `PreToolUse` text template no longer prints "TOOL EXECUTION BLOCKED". It exits 0 and
  cannot block; the banner was unreachable before (no `inputPatterns` ever matched) and would
  now be actively misleading. It reports an advisory guardrail hit and points at the `-json`
  variant, which can deny.

  **Crash fixes.** A config that omits the `skills:` block, sets it to a scalar or array, or
  contains a bare `my-skill:` entry that YAML parses as null, previously crashed `validate`
  with a `TypeError`. All are now reported as ordinary findings, and a malformed
  rule is no longer silently deleted from your file by `--fix` while the output tells you to
  fix it by hand. An empty `keywords: []` alongside real `intentPatterns`
  is no longer misreported as "no triggers defined" (a `??` that short-circuited on `false`).

  **Payload shape.** Templates accept the current `cwd` field with `working_directory` still
  honored. This is defensive: Claude Code sets `CLAUDE_PROJECT_DIR` when spawning hooks
  (verified against a live invocation), so the payload fields are a fallback, not the primary
  resolution path.

  Tests: hook assertions now check **observable output** per hook (suggestions emitted,
  guardrail matched, session state written, skills counted) instead of `exitCode === 0` —
  every hook fails open by design, so "did not crash" was satisfied by a hook that resolved
  nothing. Each case is paired with a negative control, and removing the legacy fallback turns
  exactly the legacy-payload cases red. The compiled-hook runner now pins `HOME`/`USERPROFILE`
  to a temp dir so a developer's real `~/.claude` cannot leak into results. Several fixtures
  that claimed to be valid configurations were missing required fields or `SKILL.md` files,
  and three assertions passed on substring coincidence with the skill's own name.

### Patch Changes

- Updated dependencies [73f229a]
  - @satoshibits/claude-skill-runtime@1.1.0

## 1.1.1

### Patch Changes

- 3cca4b3: switch to use npm only

## 1.1.0

### Minor Changes

- 3230c3b: enhance skill discovery with scope tracking for personal and project skills

### Patch Changes

- cd66254: derive runtime version from installed package for consistency
- Updated dependencies [86f2646]
  - @satoshibits/claude-skill-runtime@1.0.1

## 1.0.1

### Patch Changes

- b56aa2a: fix dependency name for claude-skill-runtime

## 1.0.0

### Major Changes

- 650d813: release initial create-auto-loading-claude-skills

### Patch Changes

- Updated dependencies [1f57049]
  - @satoshibits/claude-skill-runtime@1.0.0
