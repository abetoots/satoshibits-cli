// re-import types for validateRegexPatterns function
import type { SkillConfig } from "./types.mjs";

/**
 * @satoshibits/claude-skill-runtime
 *
 * Runtime library for Claude Code auto-loading skills.
 * Provides matching algorithms, config loading, and session state management.
 *
 * This package eliminates code duplication between the CLI helpers and
 * scaffolded hook templates, allowing bug fixes and improvements to be
 * applied via `npm update` without regenerating hooks.
 */

// core types - re-exported from types.mts
export type {
  ActivationStrategy,
  EnforcementAction,
  SkillRule,
  ValidationRule,
  SkillConfig,
  LogCategory,
  DebugLogger,
  SkillMatch,
  ShadowMatch,
  PreToolMatch,
  StopMatch,
  ShadowSuggestion,
  SessionData,
} from "./types.mjs";

// config loading
export { ConfigLoader, getLogger, createDefaultConfig } from "./config-loader.mjs";

// rule matching
export { RuleMatcher } from "./rule-matcher.mjs";

// session state management
export { sessionState } from "./session-state.mjs";

// path utilities
export {
  normalizeFilePath,
  normalizeFilePaths,
  resolveFilePath,
} from "./path-utils.mjs";

// debug logging
export {
  createLogger,
  createNoopLogger,
  DebugLoggerImpl,
} from "./debug-logger.mjs";

// hook utilities (shared code for template hooks)
export type {
  HookContext,
  InitHookContextOptions,
  HandleHookErrorOptions,
} from "./hook-utils.mjs";

export {
  readStdin,
  initHookContext,
  handleHookError,
} from "./hook-utils.mjs";

// pattern utilities (shared regex pattern handling)
export type { PatternField, ValidationRulePatternField } from "./pattern-utils.mjs";

export {
  extractPatternFields,
  extractValidationRulePatterns,
  validatePattern,
} from "./pattern-utils.mjs";

// shadow triggers (stateless - no user preference tracking)
export {
  convertMatchesToSuggestions,
  formatShadowSuggestions,
} from "./shadow-triggers.mjs";

// hook output types and builders
export type {
  GuaranteedSkillInfo,
  HookShadowSuggestion,
  CommonHookFields,
  UserPromptSubmitHookSpecificOutput,
  UserPromptSubmitOutput,
  PermissionDecision,
  PreToolUseHookSpecificOutput,
  PreToolUseOutput,
  PostToolUseHookSpecificOutput,
  PostToolUseOutput,
  StopHookOutput,
  SkillContextInfo,
} from "./hook-output.mjs";

export {
  formatSkillContextAsString,
  buildUserPromptSubmitOutput,
  buildBlockOutput,
  buildPreToolUseDenyOutput,
  buildPreToolUseAllowOutput,
  buildPreToolUseAskOutput,
} from "./hook-output.mjs";

import {
  extractPatternFields,
  extractValidationRulePatterns,
  validatePattern,
} from "./pattern-utils.mjs";

/**
 * Validate all regex patterns in a skill config
 * Returns an array of validation errors, empty if all patterns are valid
 */
export function validateRegexPatterns(config: SkillConfig): {
  skillName: string;
  field: string;
  pattern: string;
  error: string;
}[] {
  const errors: {
    skillName: string;
    field: string;
    pattern: string;
    error: string;
  }[] = [];

  if (!config.skills || typeof config.skills !== "object") {
    return errors;
  }

  for (const [skillName, rule] of Object.entries(config.skills)) {
    // validate standard pattern fields using shared utility
    for (const { fieldPath, patterns } of extractPatternFields(rule)) {
      for (const pattern of patterns) {
        const error = validatePattern(pattern, "i");
        if (error) {
          errors.push({ skillName, field: fieldPath, pattern, error });
        }
      }
    }

    // validate validation rule patterns using shared utility
    for (const { fieldPath, patterns, flags } of extractValidationRulePatterns(
      rule.validationRules
    )) {
      for (const pattern of patterns) {
        const error = validatePattern(pattern, flags ?? "i");
        if (error) {
          errors.push({ skillName, field: fieldPath, pattern, error });
        }
      }
    }
  }

  return errors;
}
