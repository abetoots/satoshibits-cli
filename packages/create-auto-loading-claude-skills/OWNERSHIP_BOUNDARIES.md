# Ownership Boundaries

This document clarifies the separation of concerns between this package (`create-auto-loading-claude-skills`) and Claude Code (the upstream tool it extends).

---

## The Core Principle

> **"This package provides RELIABILITY where native features are PROBABILISTIC."**

Native skill auto-loading via `description` matching is semantic but unreliable (~70-80% activation rate). This package provides deterministic guarantees for critical workflows while delegating general discovery to native features.

### The Swiss Cheese Model - Layered Reliability

| Layer | Technology | Reliability | Role |
|-------|-----------|-------------|------|
| **Layer 1** | Package (Regex/Glob) | **Deterministic (100%)** | Guardrails & critical workflows |
| **Layer 2** | Native (Description) | **Probabilistic (~70-80%)** | General assistance |
| **Layer 3** | Native (`type: "prompt"`) | **Cognitive (High)** | Deep contextual decisions |

---

## What Claude Code Natively Provides

### Skill Auto-Loading
- Skills are auto-loaded via the `description` field in `SKILL.md` matching user intent
- Discovery from `.claude/skills/*/SKILL.md` in project and personal directories

### Hook Events
| Event | Description |
|-------|-------------|
| `UserPromptSubmit` | Before Claude sees user prompt |
| `PreToolUse` | Before tool execution |
| `PostToolUse` | After tool execution |
| `Stop` | When Claude finishes responding |
| `SessionStart` | Session initialization |
| `SessionEnd` | Session cleanup |
| `PreCompact` | Before context compaction |
| `Notification` | System notifications |
| `SubagentStop` | When subagent completes |

### Hook Types
- `command`: Shell command execution
- `prompt`: LLM evaluation (Haiku)

### Session Context
- `session_id` passed to hooks
- `working_directory` available in hook input

---

## Hookify vs This Package: Complementary Tools

Both tools use pattern matching, but for **different purposes**:

| Tool | Purpose | Example Use Case |
|------|---------|------------------|
| **Hookify** | Create general-purpose hook rules | "Warn when editing .env files" |
| **This Package** | Decide WHEN to load skills based on context | "Load typescript-code-quality when editing .ts files" |

These are **complementary, not competing**. No integration is needed between them.

---

## What This Package Legitimately Owns

| Component | Justification |
|-----------|---------------|
| `skill-rules.yaml` schema | Centralized configuration format not provided natively |
| `activation_strategy` | Granular control: `guaranteed`, `suggestive`, `prompt_enhanced`, `native_only` |
| Compiler Pattern (`sync`) | Generates `skill-rules.yaml` from `x-smart-triggers` in SKILL.md |
| JSON hook output | Structured output (`additionalContext`, `updatedInput`, `decision`) for native integration |
| Trigger matching algorithms | Multi-factor scoring, dual-condition matching (prompt + file) |
| File modification tracking | Claude Code doesn't track edited files across prompts |
| Activation history + cooldowns | Prevents skill suggestion spam (not native) |
| Shadow triggers | Unique value - suggest skills without auto-loading (cost control) |
| `decision: "block"` enforcement | Policy enforcement via native hook output |
| CLI tooling | Management interface (`init`, `add-skill`, `sync`, `test`) |
| Validation reminders | Feedback loop for skill compliance (not native) |

### Session State Tracking

This package maintains session state that Claude Code doesn't natively track:

- **Modified files**: Tracks files edited across prompts in a session
- **Activation timestamps**: Enables cooldown logic to prevent spam
- **Domain detection**: Identifies active context (e.g., "testing", "documentation")

This is legitimate value-add, not duplication of upstream functionality.

---

## What Would Overstep Boundaries

| Component | Issue | Status |
|-----------|-------|--------|
| Skill lifecycle/GC | Cannot control Claude's context window | **Removed** |
| Runtime hook behavior | Should be in skill's own hooks | Templates only (users own installed copies) |
| Context window management | Upstream responsibility | Not implemented |

### Why Lifecycle Was Removed

The `skill-lifecycle.ts` module attempted to implement garbage collection for skills:
- Track activation times
- Unload skills after timeout/completion

**The problem**: Once a skill's content is injected into Claude's context, **we cannot remove it**. Context management is Claude Code's domain.

**Decision**: Remove entirely for a clean break. No confusion about what this package can actually control.

---

## Hook Templates: User-Owned

The hooks in `src/templates/hooks/` are **templates copied to the user's project** on CLI install:

```
src/templates/hooks/        → .claude/hooks/  (user's project)
```

This follows standard scaffolding patterns (like `create-react-app`). Once copied:
- Users own the installed files
- Users can customize them
- This package doesn't control runtime behavior

This is the correct pattern - not an ownership violation.

---

## Trigger Types and Their Role

All triggers in `skill-rules.yaml` serve one purpose: **deciding WHEN to suggest or load a skill**.

| Trigger Type | What It Detects | Loading Behavior |
|--------------|-----------------|------------------|
| `promptTriggers` | Keywords/patterns in user prompt | Auto-load (based on enforcement) |
| `fileTriggers` | Paths/content of modified files | Auto-load (based on enforcement) |
| `preToolTriggers` | Tool about to be used | Just-in-time loading |
| `stopTriggers` | Claude claiming completion | Verification skill loading |
| `shadowTriggers` | Same as prompt triggers | Suggest only (never auto-load) |

Once loaded, the skill's own hooks (defined in SKILL.md frontmatter) handle runtime behavior.

---

## Integration Points

### What This Package Hooks Into

```
User Prompt → [UserPromptSubmit hook] → skill-rules.yaml matching → Skill suggestion/loading
Tool Use    → [PreToolUse hook]       → preToolTriggers matching  → Just-in-time skill loading
Stop        → [Stop hook]             → stopTriggers matching     → Verification skill loading
```

### What This Package Does NOT Control

- Tool execution
- Context window content removal
- Native skill hooks registration
- Session lifecycle
- Token usage/costs

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude Code                              │
│  (Session management, tool execution, context, native hooks)    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ hooks into (JSON output)
                              │
┌─────────────────────────────────────────────────────────────────┐
│              create-auto-loading-claude-skills                   │
│              (Workflow Orchestration & Reliability Engine)       │
├─────────────────────────────────────────────────────────────────┤
│  INPUT                                                           │
│  ├─ User prompt (via UserPromptSubmit)                          │
│  ├─ Tool intent (via PreToolUse)                                │
│  ├─ Claude response (via Stop)                                   │
│  └─ Session init (via SessionStart)                              │
│                                                                  │
│  PROCESSING                                                      │
│  ├─ Load skill-rules.yaml (or sync from x-smart-triggers)       │
│  ├─ Match triggers against input                                │
│  ├─ Score and rank matches                                      │
│  ├─ Check activation_strategy per skill                         │
│  ├─ Apply cooldowns (recently activated filter)                 │
│  └─ Determine enforcement (auto-load, suggest, warn, block)     │
│                                                                  │
│  OUTPUT (JSON)                                                   │
│  ├─ additionalContext: Inject guaranteed skills                 │
│  ├─ updatedInput: Add hints for suggestive skills               │
│  ├─ decision: "Proceed" or "block"                              │
│  └─ Track activation (for cooldown logic)                       │
└─────────────────────────────────────────────────────────────────┘
```

### The Compiler Pattern

```
┌─────────────────┐     claude-skills sync     ┌─────────────────┐
│   SKILL.md      │  ─────────────────────────▶│ skill-rules.yaml│
│   (x-smart-     │                            │ (build artifact)│
│    triggers)    │                            │                 │
└─────────────────┘                            └─────────────────┘
     SOURCE                                         GENERATED
```

Definition is co-located with skill (architecture win), execution is centralized (reliability win).

---

## Summary

This package is a **Reliability Engine** that:

1. **Guarantees** activation for critical skills where native matching is probabilistic
2. **Matches** triggers against user context (prompts, files, tools, completion)
3. **Scores** potential skill activations with configurable `activation_strategy`
4. **Decides** whether to inject, hint, block, or delegate to native
5. **Tracks** activations to prevent spam
6. **Syncs** trigger definitions from SKILL.md to centralized rules (Compiler Pattern)

It does **not**:
- Control Claude's context window
- Manage skill runtime behavior
- Replace native features (it augments them with reliability guarantees)
- Implement hooks that skills should own themselves

### Activation Strategy Guide

| Strategy | Package Behavior | Use Case |
|----------|------------------|----------|
| `guaranteed` | Inject skill via `additionalContext` | Critical workflows that MUST activate |
| `suggestive` | Add hints via `updatedInput` | Helpful skills, boost native matching |
| `prompt_enhanced` | Gather context → feed to Haiku hook | Semantic decisions with rich context |
| `native_only` | Do nothing (default) | General-purpose skills |

When in doubt, remember: **"RELIABILITY where native is PROBABILISTIC."**
