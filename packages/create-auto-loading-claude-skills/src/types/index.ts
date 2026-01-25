/**
 * Types module
 *
 * Re-exports type definitions from @satoshibits/claude-skill-runtime
 * for hook outputs and other shared types.
 *
 * CORRECTED per HOOKS_REFERENCE_CLAUDE.md:
 * - UserPromptSubmit: additionalContext is STRING under hookSpecificOutput
 * - PreToolUse: uses permissionDecision (allow/deny/ask)
 */

// re-export CLI option types
export type {
  InitOptions,
  AddSkillOptions,
  WizardOptions,
  ValidateOptions,
  SyncOptions,
  UpgradeOptions,
  SyncMetadata,
} from './cli-options.js';

// re-export core skill types from runtime (avoid duplicating SkillRulesConfig)
export type {
  SkillRule,
  SkillConfig,
  ValidationRule,
  ActivationStrategy,
  EnforcementAction,
  SkillMatch,
  ShadowMatch,
  PreToolMatch,
  StopMatch,
} from '@satoshibits/claude-skill-runtime';

// re-export hook output types from runtime with backward compatibility aliases
export type {
  GuaranteedSkillInfo,
  HookShadowSuggestion as ShadowSuggestion, // backward compat alias
  CommonHookFields,
  UserPromptSubmitHookSpecificOutput,
  UserPromptSubmitOutput,
  PermissionDecision,
  PreToolUseHookSpecificOutput,
  PreToolUseOutput,
  PostToolUseHookSpecificOutput,
  PostToolUseOutput,
  StopHookOutput as StopOutput, // backward compat alias
  SkillContextInfo,
} from '@satoshibits/claude-skill-runtime';

// re-export hook output builder functions from runtime
export {
  formatSkillContextAsString,
  buildUserPromptSubmitOutput,
  buildBlockOutput,
  buildPreToolUseDenyOutput,
  buildPreToolUseAllowOutput,
  buildPreToolUseAskOutput,
} from '@satoshibits/claude-skill-runtime';
