# ADR-003: Hook Boundary Constraints

**Status**: Accepted
**Date**: 2026-01-25
**Decision Makers**: Multi-model consensus (Gemini 2.5 Pro, Codex, Claude Opus 4.5)

## Context

During code review, we discovered that several features in `claude-skill-runtime` assumed capabilities that Claude Code hooks don't have. Specifically, the dismissal tracking system (`trackDismissal`, `isSkillSuppressed`, `getDismissalStats`, `ShadowTriggerState`) assumed hooks could receive user feedback.

## Decision

**Hooks are stateless, one-way output pipelines.** The package must respect these constraints:

### What Hooks CAN Do (Output-Only)
- `additionalContext: string` - Inject context into LLM
- `permissionDecision: allow|deny|ask` - Control tool execution
- `decision: block` - Stop execution with reason
- Write to stdout/stderr for logging

### What Hooks CANNOT Do
- Receive user feedback ("user dismissed this suggestion")
- Track user preferences across prompts
- Present interactive UI elements
- Maintain bidirectional communication

### Removed Code

The following boundary-violating code was removed from `claude-skill-runtime`:

```typescript
// REMOVED - required user feedback that hooks can't receive
trackDismissal(skillName, dismissalCounts)
isSkillSuppressed(skillName, dismissalCounts)
getDismissalStats(dismissalCounts)
ShadowTriggerState interface
ShadowSuggestion.dismissed field
MAX_DISMISSALS_BEFORE_SUPPRESSION constant
```

### Preserved Code

```typescript
// KEPT - valid stateless functions
convertMatchesToSuggestions(matches)  // simplified, no dismissedSkills param
formatShadowSuggestions(suggestions)  // output formatting only
matchShadowTriggers()                 // core matching logic
```

## Consequences

### Positive
- Package now correctly respects hook architecture
- Cleaner, simpler API surface
- No dead code that can't actually work

### Negative
- No way to suppress frequently-dismissed skills (would require native Claude Code support)
- Users who want preference tracking must use CLAUDE.md blocklists manually

## Alternatives for User Preference Tracking

If dismissal tracking is truly needed:
1. **Native feature request** - Ask Anthropic to add dismissal tracking to hooks
2. **CLAUDE.md blocklist** - User manually adds "Don't suggest skill X"
3. **MCP server** - Separate server with bidirectional communication
4. **Prompt parsing** - Parse "don't suggest X again" from prompts (unreliable)

## References

- [HOOKS_REFERENCE_CLAUDE.md](../../HOOKS_REFERENCE_CLAUDE.md) - Official hook documentation
- [SIMPLICITY_CODE_CLEANER_MULTI_REVIEW.md](../../SIMPLICITY_CODE_CLEANER_MULTI_REVIEW.md) - Code review findings
