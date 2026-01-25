/**
 * Internal utilities
 *
 * Re-exports from claude-skill-runtime package.
 * This module provides backward compatibility for existing code.
 */

// re-export everything from the runtime library
export {
  // config loading
  ConfigLoader,
  getLogger,

  // rule matching
  RuleMatcher,

  // session state
  sessionState,

  // path utilities
  resolveFilePath,
  normalizeFilePath,
  normalizeFilePaths,

  // debug logging
  createLogger,
  createNoopLogger,
  DebugLoggerImpl,

  // shadow triggers (stateless - no user preference tracking)
  convertMatchesToSuggestions,
  formatShadowSuggestions,

  // regex validation
  validateRegexPatterns,
} from '@satoshibits/claude-skill-runtime';

// re-export types
export type {
  ActivationStrategy,
  EnforcementAction,
  SkillConfig,
  SkillRule,
  ValidationRule,
  SkillMatch,
  ShadowMatch,
  PreToolMatch,
  StopMatch,
  ShadowSuggestion,
  LogCategory,
  DebugLogger,
  SessionData,
} from '@satoshibits/claude-skill-runtime';
