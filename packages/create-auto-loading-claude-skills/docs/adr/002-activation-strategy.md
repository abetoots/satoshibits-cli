# ADR-002: Activation Strategy Architecture

**Status**: Accepted
**Date**: 2026-01-23
**Decision Makers**: Multi-model consensus (Gemini 2.5 Pro, Gemini 3 Pro Preview, Claude Opus 4.5)

## Context

With the package established as a reliability layer (ADR-001), we needed to define how individual skills interact with both the package and native Claude Code features. Not all skills need deterministic guarantees - some benefit from native semantic matching.

## Decision

Introduce `activationStrategy` field in skill-rules.yaml with four options:

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `guaranteed` | Package injects skill directly via `additionalContext` | Critical workflows that MUST activate |
| `suggestive` | Package adds hints to boost native matching | Helpful skills, not critical |
| `prompt_enhanced` | Package gathers context, feeds to prompt hook | Semantic decisions with rich context |
| `native_only` | Package does nothing (default) | General-purpose skills |

### Configuration Example

```yaml
skills:
  terraform-apply:
    activationStrategy: guaranteed
    promptTriggers:
      intentPatterns: ["(apply|deploy).*terraform"]

  backend-dev-guidelines:
    activationStrategy: suggestive
    promptTriggers:
      keywords: ["controller", "service", "API"]
```

## Consequences

### Positive
- Granular control over reliability vs native delegation
- Critical skills get deterministic activation
- General skills benefit from native semantic understanding
- Clear mental model for skill authors

### Negative
- Additional configuration complexity
- Users must understand when to use each strategy
- `guaranteed` skills consume context window budget

## Implementation Notes

- `guaranteed` skills should use `disable-model-invocation: true` in SKILL.md frontmatter
- `prompt_enhanced` requires separate prompt hook file (Haiku reasoning)
- Default is `native_only` when `activationStrategy` is omitted

## References

- [ADR-001](./001-reliability-layer-architecture.md) - Reliability layer foundation
- [ARCHITECTURE_MULTI_REVIEW.md](../../ARCHITECTURE_MULTI_REVIEW.md) - Full design discussion
