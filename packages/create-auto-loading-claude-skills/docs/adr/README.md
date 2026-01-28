# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant technical decisions for the `@satoshibits/create-auto-loading-claude-skills` and `@satoshibits/claude-skill-runtime` packages.

## Index

| ADR                                                | Title                            | Status   | Date       |
| -------------------------------------------------- | -------------------------------- | -------- | ---------- |
| [ADR-001](./001-reliability-layer-architecture.md) | Package as Reliability Layer     | Accepted | 2026-01-23 |
| [ADR-002](./002-activation-strategy.md)            | Activation Strategy Architecture | Accepted | 2026-01-23 |
| [ADR-003](./003-hook-boundary-constraints.md)      | Hook Boundary Constraints        | Accepted | 2026-01-25 |
| [ADR-004](./004-dual-source-architecture.md)       | Dual Source Architecture         | Accepted | 2026-01-27 |

## ADR Process

1. **Proposed**: Decision is being discussed
2. **Accepted**: Decision has been made and implementation is in progress or complete
3. **Superseded**: Decision has been replaced by a newer ADR
4. **Deprecated**: Decision is no longer relevant

## Multi-Model Review Process

These ADRs were informed by multi-model consensus reviews involving:

- **Gemini 2.5 Pro** - Architecture advocacy
- **Gemini 3 Pro Preview** - Simplicity/YAGNI advocacy
- **OpenAI Codex** - Code quality analysis
- **Claude Opus 4.5** - Lead synthesis and validation
