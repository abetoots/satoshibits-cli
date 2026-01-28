/**
 * @satoshibits/create-auto-loading-claude-skills
 *
 * Public API exports for programmatic usage and custom validators.
 *
 * @example
 * ```ts
 * import {
 *   createValidator,
 *   createSession,
 *   createUI,
 *   type Session,
 *   type UI,
 * } from '@satoshibits/create-auto-loading-claude-skills';
 *
 * const myValidator = createValidator({
 *   name: 'my-custom-validator',
 *   validate: ({ session, ui }) => {
 *     if (session.hasModifiedFiles(/\.test\.ts$/)) {
 *       ui.addReminder({ message: 'Tests modified - run test suite' });
 *     }
 *   }
 * });
 * ```
 */

// primitives for creating custom validators
export {
  createSession,
  createUI,
  createTestUI,
  createValidator,
  runValidators,
} from "./helpers/primitives/index.js";

// types for validators
export type {
  Session,
  ModifiedFile,
  UI,
  Reminder,
  ValidatorFn,
  ValidatorConfig,
  ValidatorContext,
} from "./helpers/primitives/index.js";

// pre-built validators
export { validators } from "./helpers/validators/index.js";

// core types from runtime library (for advanced users)
export type {
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
} from "./helpers/internal/index.js";

// utilities for advanced usage
export {
  ConfigLoader,
  RuleMatcher,
  sessionState,
  validateRegexPatterns,
} from "./helpers/internal/index.js";
