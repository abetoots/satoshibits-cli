# ADR-004: Dual Source Architecture for Skill Activation Rules

**Status**: Accepted
**Date**: 2026-01-27
**Decision Makers**: Multi-model consensus (Gemini 2.5 Pro, Gemini 3 Pro Preview, Claude Opus 4.5)

## Context

The package evolved to support two workflows for defining skill activation rules:

1. **Manual editing** of `skill-rules.yaml` directly
2. **Compiler Pattern** via `x-smart-triggers` in SKILL.md → `sync` command

Documentation inconsistency emerged:
- README.md presented direct YAML editing as the primary approach
- ARCHITECTURE_MULTI_REVIEW.md described `skill-rules.yaml` as a "build artifact"
- CLI (`add-skill`) creates BOTH SKILL.md AND writes to skill-rules.yaml

This created confusion about the "correct" way to configure activation rules.

## Decision

**Both workflows are valid and officially supported.** The package implements a "Dual Source Architecture" where:

| Workflow | Method | Best For |
|----------|--------|----------|
| **Manual** | Edit `skill-rules.yaml` directly | Getting started, quick iteration, standalone rules |
| **Compiler** | `x-smart-triggers` in SKILL.md → `sync` | Team-shared skills, version control, scaling |

### Coexistence Mechanism

The `sync` command preserves manual entries via `_sync.manualSkills` metadata tracking:

1. `sync` reads existing `skill-rules.yaml`
2. Skills NOT found in any SKILL.md are marked as "manual"
3. Manual skills are preserved during regeneration
4. Only skills with matching `x-smart-triggers` frontmatter are overwritten

This enables gradual migration without breaking existing configurations.

### When to Use Each

| Scenario | Recommended Workflow |
|----------|---------------------|
| First skill, learning the system | Manual |
| Quick prototyping of triggers | Manual |
| Standalone guardrails (no SKILL.md content) | Manual |
| Team-shared skill with documentation | Compiler |
| Skills checked into git for review | Compiler |
| Many skills across a monorepo | Compiler |

## Consequences

### Positive
- No migration required for existing users
- Flexibility to choose workflow per-skill
- Gradual adoption path from manual to compiler
- CLI behavior (`add-skill`) aligns with both workflows

### Negative
- Two "sources of truth" can confuse new users
- Must document both workflows clearly
- `sync` command behavior more complex (preservation logic)

## Alternatives Considered

1. **Compiler-only**: Rejected - forces unnecessary SKILL.md files for simple guardrails
2. **Manual-only**: Rejected - loses co-location benefits for complex skills
3. **Migration tool**: Rejected - adds complexity, dual-source is simpler
4. **Dual Source (Accepted)**: Both valid, clear documentation, preservation on sync

## References

- [ARCHITECTURE_MULTI_REVIEW.md](../../ARCHITECTURE_MULTI_REVIEW.md) - Compiler Pattern analysis
- [README.md](../../README.md) - User-facing documentation
- `src/sync.ts` - Implementation of preservation logic
