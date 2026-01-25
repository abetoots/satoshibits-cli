/**
 * Core skill type definitions
 *
 * Shared types between CLI (utils) and runtime (helpers) to ensure
 * consistency between skill configuration producers and consumers.
 */

/**
 * Activation strategy for hybrid reliability architecture
 *
 * Determines how the package interacts with native Claude Code features:
 * - guaranteed: Package bypasses native, injects skill directly (100% reliable)
 * - suggestive: Package adds hints to boost native matching (deterministic nudge)
 * - prompt_enhanced: Package gathers context, feeds to Haiku hook (semantic + context)
 * - native_only: Package does nothing, delegates to native (default)
 */
export type ActivationStrategy =
  | 'guaranteed'
  | 'suggestive'
  | 'prompt_enhanced'
  | 'native_only';

/**
 * Enforcement action for validation rules
 *
 * - block: Output decision: "block" to prevent execution
 * - reminder: Output a gentle reminder without blocking
 */
export type EnforcementAction = 'block' | 'reminder';

/**
 * Validation rule for skill feedback loop
 */
export interface ValidationRule {
  name: string;
  condition: {
    pattern?: string;
    pathPattern?: string;
  };
  requirement: {
    pattern?: string;
    fileExists?: string;
  };
  reminder: string;
  /**
   * Enforcement action when validation fails
   * - block: Output decision: "block" to prevent execution
   * - reminder: Output a gentle reminder without blocking (default)
   */
  enforcement?: EnforcementAction;
}

/**
 * Skill activation and validation configuration
 */
export interface SkillRule {
  type: 'domain' | 'guardrail' | 'workflow';
  enforcement: 'suggest' | 'warn' | 'block' | 'manual';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  /**
   * Activation strategy for hybrid reliability architecture
   * Determines how the package interacts with native Claude Code features
   * @default 'native_only'
   */
  activationStrategy?: ActivationStrategy;
  /**
   * Path to prompt hook file for 'prompt_enhanced' strategy
   * The hook receives rich context gathered by the package and uses Haiku for semantic decisions
   */
  promptHook?: string;
  /**
   * Cooldown in minutes before this skill can be re-activated
   * Prevents suggestion spam for frequently-triggered skills
   */
  cooldownMinutes?: number;
  promptTriggers?: {
    keywords?: string[];
    intentPatterns?: string[];
  };
  fileTriggers?: {
    pathPatterns?: string[];
    contentPatterns?: string[];
  };
  /**
   * Shadow triggers - match but suggest instead of auto-load
   * For MANUAL-ONLY skills that could benefit from contextual suggestions
   */
  shadowTriggers?: {
    keywords?: string[];
    intentPatterns?: string[];
  };
  /**
   * Pre-tool triggers - match tool intent before execution
   * Useful for guardrails that should fire when Claude is about to use specific tools
   */
  preToolTriggers?: {
    toolName: string;
    inputPatterns?: string[];
  };
  /**
   * Stop triggers - match Claude's behavior when completing work
   * Useful for verification skills that should fire when Claude claims completion
   */
  stopTriggers?: {
    keywords?: string[];
    promptEvaluation?: string;
  };
  validationRules?: ValidationRule[];
}

/**
 * Skill configuration file structure
 */
export interface SkillConfig {
  version: string;
  description: string;
  settings?: {
    maxSuggestions?: number;
    cacheDirectory?: string;
    enableDebugLogging?: boolean;
    debugCategories?: LogCategory[];
    scoring?: {
      keywordMatchScore?: number;
      intentPatternScore?: number;
      filePathMatchScore?: number;
      fileContentMatchScore?: number;
    };
    thresholds?: {
      recentActivationMinutes?: number;
    };
  };
  skills: Record<string, SkillRule>;
}

/**
 * Log categories for debug logging
 */
export type LogCategory =
  | 'activation'
  | 'scoring'
  | 'validation'
  | 'state'
  | 'perf'
  | 'io'
  | 'error';

/**
 * Debug logger interface
 */
export interface DebugLogger {
  log(category: LogCategory, message: string, data?: object): void;
}

/**
 * Skill match result - for auto-loading
 */
export interface SkillMatch {
  skillName: string;
  rule: SkillRule;
  score: number;
  promptMatch: boolean;
  fileMatch: boolean;
}

/**
 * Shadow match - suggests skill without auto-loading
 * For MANUAL-ONLY skills that could benefit from contextual suggestions
 */
export interface ShadowMatch {
  skillName: string;
  rule: SkillRule;
  score: number;
  reason: string;
}

/**
 * Pre-tool match - triggers before tool execution
 * For guardrails that should fire when Claude is about to use specific tools
 */
export interface PreToolMatch {
  skillName: string;
  rule: SkillRule;
  toolName: string;
  matchedPattern?: string;
}

/**
 * Stop match - triggers when Claude completes work
 * For verification skills that should fire when Claude claims completion
 */
export interface StopMatch {
  skillName: string;
  rule: SkillRule;
  matchedKeyword?: string;
  requiresPromptEvaluation: boolean;
}

/**
 * Shadow suggestion for user display
 *
 * NOTE: Hooks cannot track user dismissals (stateless output-only).
 * User preference tracking requires native Claude Code support.
 */
export interface ShadowSuggestion {
  skillName: string;
  description: string;
  reason: string;
  score: number;
}

/**
 * Session data structure for persistence
 */
export interface SessionData {
  modifiedFiles: string[];
  activeDomains: string[];
  lastActivatedSkills: Record<string, number>;
  currentPromptSkills: string[];
  toolUseCount: number;
  createdAt: number;
}
