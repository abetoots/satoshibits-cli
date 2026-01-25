# ADR-001: Package as Reliability Layer

**Status**: Accepted
**Date**: 2026-01-23
**Decision Makers**: Multi-model consensus (Gemini 2.5 Pro, Gemini 3 Pro Preview, Claude Opus 4.5)

## Context

Claude Code's native skill system uses semantic `description` matching to auto-load skills. During development, we observed that this approach is **probabilistic** (~70-80% activation rate) rather than deterministic. Critical workflows were being missed.

The question arose: Should this package exist at all, or does it duplicate native functionality?

## Decision

**This package is a Reliability Layer, not redundant complexity.**

The package provides **deterministic guarantees** where native features are probabilistic. It uses lifecycle hooks and pattern matching to ensure skills activate when needed.

### The "Swiss Cheese Model" - Layered Reliability

| Layer | Technology | Reliability | Role |
|-------|-----------|-------------|------|
| **Layer 1** | Package (Regex/Glob) | **Deterministic (100%)** | Guardrails & critical workflows |
| **Layer 2** | Native (Description) | **Probabilistic (~70-80%)** | General assistance |

## Consequences

### Positive
- Critical workflows (deployments, migrations) always activate appropriate skills
- 90%+ activation rate in relevant contexts (up from ~20% native-only)
- Package augments native system rather than fighting it

### Negative
- Additional complexity layer to maintain
- Users must learn both native skills and package configuration
- Risk of "guaranteed" skills flooding context window

## Alternatives Considered

1. **Deprecate package, use native only**: Rejected - native reliability insufficient for critical workflows
2. **Replace native entirely**: Rejected - native semantic matching valuable for general discovery
3. **Hybrid approach**: Accepted - package handles critical, native handles general

## References

- [ARCHITECTURE_MULTI_REVIEW.md](../../ARCHITECTURE_MULTI_REVIEW.md) - Full multi-model analysis
- [HOOKS_REFERENCE_CLAUDE.md](../../HOOKS_REFERENCE_CLAUDE.md) - Native hook documentation
