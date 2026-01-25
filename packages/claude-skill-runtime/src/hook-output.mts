/**
 * Hook output types for native runtime integration
 *
 * These types define the structured JSON output format for Claude Code hooks.
 * CORRECTED per official HOOKS_REFERENCE_CLAUDE.md:
 * - UserPromptSubmit: additionalContext is STRING under hookSpecificOutput, no updatedInput
 * - PreToolUse: uses permissionDecision (allow/deny/ask), not deprecated decision
 * - decision: "block" or omitted (not "Proceed")
 */

/**
 * Skill information for guaranteed injection
 */
export interface GuaranteedSkillInfo {
  name: string;
  description: string;
  content: string;
  usage?: string;
}

/**
 * Shadow suggestion from shadow triggers (visible but not auto-loaded)
 */
export interface HookShadowSuggestion {
  name: string;
  description: string;
  reason: string;
}

// ============================================================================
// Common Hook Output Fields (apply to all hooks)
// ============================================================================

/**
 * Common fields that apply to all hook outputs
 * Per HOOKS_REFERENCE_CLAUDE.md common JSON schema
 */
export interface CommonHookFields {
  /** Whether Claude should continue after hook execution (default: true) */
  continue?: boolean;
  /** Message shown when continue is false */
  stopReason?: string;
  /** Hide stdout from transcript mode (default: false) */
  suppressOutput?: boolean;
  /** Optional warning message shown to the user */
  systemMessage?: string;
}

// ============================================================================
// UserPromptSubmit Hook Output (CORRECTED)
// ============================================================================

/**
 * Hook-specific output for UserPromptSubmit
 * Per official docs: additionalContext must be a STRING
 */
export interface UserPromptSubmitHookSpecificOutput {
  hookEventName: "UserPromptSubmit";
  /** Context to inject - MUST be a string, not an object */
  additionalContext?: string;
}

/**
 * Structured JSON output for UserPromptSubmit hook
 *
 * CORRECTED per HOOKS_REFERENCE_CLAUDE.md:
 * - decision: "block" or omitted (NOT "Proceed")
 * - additionalContext: string under hookSpecificOutput (NOT object at top level)
 * - updatedInput: NOT SUPPORTED for UserPromptSubmit
 */
export interface UserPromptSubmitOutput extends CommonHookFields {
  /** Block decision - omit to allow prompt to proceed */
  decision?: "block";
  /** Reason for blocking (required if decision is "block") */
  reason?: string;
  /** Hook-specific output with additionalContext */
  hookSpecificOutput?: UserPromptSubmitHookSpecificOutput;
}

// ============================================================================
// PreToolUse Hook Output (CORRECTED)
// ============================================================================

/**
 * Permission decision for PreToolUse hooks
 * - allow: bypass permission system
 * - deny: prevent tool execution
 * - ask: show confirmation to user
 */
export type PermissionDecision = "allow" | "deny" | "ask";

/**
 * Hook-specific output for PreToolUse
 * Per official docs: uses permissionDecision, not deprecated decision
 */
export interface PreToolUseHookSpecificOutput {
  hookEventName: "PreToolUse";
  /** Permission decision (allow/deny/ask) */
  permissionDecision?: PermissionDecision;
  /** Reason for the permission decision */
  permissionDecisionReason?: string;
  /** Modified tool input parameters */
  updatedInput?: Record<string, unknown>;
  /** Context to inject - MUST be a string */
  additionalContext?: string;
}

/**
 * Structured JSON output for PreToolUse hook
 *
 * CORRECTED per HOOKS_REFERENCE_CLAUDE.md:
 * - Use hookSpecificOutput.permissionDecision (allow/deny/ask)
 * - The deprecated decision: "block" maps to permissionDecision: "deny"
 */
export interface PreToolUseOutput extends CommonHookFields {
  /** Hook-specific output */
  hookSpecificOutput?: PreToolUseHookSpecificOutput;
}

// ============================================================================
// PostToolUse Hook Output
// ============================================================================

/**
 * Hook-specific output for PostToolUse
 */
export interface PostToolUseHookSpecificOutput {
  hookEventName: "PostToolUse";
  /** Context to inject - MUST be a string */
  additionalContext?: string;
}

/**
 * Structured JSON output for PostToolUse hook
 */
export interface PostToolUseOutput extends CommonHookFields {
  /** Block decision to prompt Claude with reason */
  decision?: "block";
  /** Reason for the decision */
  reason?: string;
  /** Hook-specific output */
  hookSpecificOutput?: PostToolUseHookSpecificOutput;
}

// ============================================================================
// Stop Hook Output
// ============================================================================

/**
 * Structured JSON output for Stop/SubagentStop hooks
 */
export interface StopHookOutput extends CommonHookFields {
  /** Block to prevent stopping */
  decision?: "block";
  /** Reason - required when blocking */
  reason?: string;
}

// ============================================================================
// Internal Types (for building context strings)
// ============================================================================

/**
 * Internal structure for skill context (converted to string for output)
 */
export interface SkillContextInfo {
  activated_by_reliability_engine: boolean;
  guaranteed_skills?: GuaranteedSkillInfo[];
  suggested_skills?: {
    name: string;
    description: string;
    reason: string;
  }[];
  active_context?: {
    modified_files: string[];
    active_domains: string[];
  };
  shadow_suggestions?: HookShadowSuggestion[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format skill context as a string for additionalContext
 * This converts the structured skill info into a readable string format
 */
export function formatSkillContextAsString(context: SkillContextInfo): string {
  const lines: string[] = [];

  lines.push("=== SKILL RELIABILITY ENGINE ===");

  if (context.guaranteed_skills && context.guaranteed_skills.length > 0) {
    lines.push("\n## Guaranteed Skills (auto-activated):");
    for (const skill of context.guaranteed_skills) {
      lines.push(`\n### /${skill.name}`);
      lines.push(`Description: ${skill.description}`);
      if (skill.usage) {
        lines.push(`Usage: ${skill.usage}`);
      }
      lines.push("\n--- Skill Content ---");
      lines.push(skill.content);
      lines.push("--- End Skill Content ---");
    }
  }

  if (context.suggested_skills && context.suggested_skills.length > 0) {
    lines.push("\n## Suggested Skills (consider invoking):");
    for (const skill of context.suggested_skills) {
      lines.push(`- /${skill.name}: ${skill.description} (${skill.reason})`);
    }
  }

  if (context.shadow_suggestions && context.shadow_suggestions.length > 0) {
    lines.push("\n## Related Skills (may be relevant):");
    for (const skill of context.shadow_suggestions) {
      lines.push(`- /${skill.name}: ${skill.description} (${skill.reason})`);
    }
  }

  if (context.active_context) {
    if (context.active_context.modified_files.length > 0) {
      lines.push("\n## Active File Context:");
      lines.push(
        `Modified files: ${context.active_context.modified_files.join(", ")}`
      );
    }
    if (context.active_context.active_domains.length > 0) {
      lines.push(
        `Active domains: ${context.active_context.active_domains.join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

/**
 * Build UserPromptSubmit output with skill context
 */
export function buildUserPromptSubmitOutput(
  context: SkillContextInfo | null
): UserPromptSubmitOutput {
  if (!context) {
    // no context - just return empty (allows prompt to proceed)
    return {};
  }

  const contextString = formatSkillContextAsString(context);

  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: contextString,
    },
  };
}

/**
 * Build blocking output for UserPromptSubmit
 */
export function buildBlockOutput(reason: string): UserPromptSubmitOutput {
  return {
    decision: "block",
    reason,
  };
}

/**
 * Build PreToolUse deny output
 */
export function buildPreToolUseDenyOutput(
  reason: string,
  additionalContext?: string
): PreToolUseOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
      additionalContext,
    },
  };
}

/**
 * Build PreToolUse allow output
 */
export function buildPreToolUseAllowOutput(
  additionalContext?: string
): PreToolUseOutput {
  if (!additionalContext) {
    return {};
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext,
    },
  };
}

/**
 * Build PreToolUse ask output (show confirmation to user)
 */
export function buildPreToolUseAskOutput(
  reason: string,
  additionalContext?: string
): PreToolUseOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: reason,
      additionalContext,
    },
  };
}
