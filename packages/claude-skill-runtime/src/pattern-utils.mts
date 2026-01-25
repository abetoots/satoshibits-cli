/**
 * Pattern Utilities - shared utilities for regex pattern handling
 *
 * Centralizes the logic for extracting and iterating over pattern fields
 * from skill rules. Used by both validation and compilation code.
 */

import type { SkillRule, ValidationRule } from "./types.mjs";

/**
 * Represents a pattern field from a skill rule
 */
export interface PatternField {
  /** Field path for error messages (e.g., "promptTriggers.intentPatterns") */
  fieldPath: string;
  /** The pattern strings to validate/compile */
  patterns: string[];
  /** Regex flags to use (default: "i" for case-insensitive) */
  flags?: string;
}

/**
 * Extract all pattern fields from a skill rule
 *
 * Centralizes the logic for iterating over pattern arrays in a skill rule.
 * Used by both validateRegexPatterns() and compilePatterns().
 *
 * @example
 * ```ts
 * for (const { fieldPath, patterns } of extractPatternFields(rule)) {
 *   for (const pattern of patterns) {
 *     try { new RegExp(pattern, "i"); }
 *     catch (e) { // handle error }
 *   }
 * }
 * ```
 */
export function extractPatternFields(rule: SkillRule): PatternField[] {
  const fields: PatternField[] = [];

  // prompt trigger intent patterns
  if (rule.promptTriggers?.intentPatterns?.length) {
    fields.push({
      fieldPath: "promptTriggers.intentPatterns",
      patterns: rule.promptTriggers.intentPatterns,
    });
  }

  // file trigger content patterns
  if (rule.fileTriggers?.contentPatterns?.length) {
    fields.push({
      fieldPath: "fileTriggers.contentPatterns",
      patterns: rule.fileTriggers.contentPatterns,
    });
  }

  // shadow trigger intent patterns
  if (rule.shadowTriggers?.intentPatterns?.length) {
    fields.push({
      fieldPath: "shadowTriggers.intentPatterns",
      patterns: rule.shadowTriggers.intentPatterns,
    });
  }

  // pre-tool input patterns
  if (rule.preToolTriggers?.inputPatterns?.length) {
    fields.push({
      fieldPath: "preToolTriggers.inputPatterns",
      patterns: rule.preToolTriggers.inputPatterns,
    });
  }

  return fields;
}

/**
 * Validation rule pattern field (extends PatternField with ruleName)
 */
export interface ValidationRulePatternField extends PatternField {
  ruleName: string;
}

/**
 * Extract all pattern fields from validation rules
 *
 * Handles the nested structure of validation rules which have
 * patterns in both condition and requirement sections.
 */
export function extractValidationRulePatterns(
  validationRules: ValidationRule[] | undefined
): ValidationRulePatternField[] {
  const fields: ValidationRulePatternField[] = [];

  if (!validationRules) return fields;

  for (const vRule of validationRules) {
    // condition.pattern (case-insensitive)
    if (vRule.condition.pattern) {
      fields.push({
        fieldPath: `validationRules[${vRule.name}].condition.pattern`,
        patterns: [vRule.condition.pattern],
        ruleName: vRule.name,
      });
    }

    // condition.pathPattern (case-sensitive for paths)
    if (vRule.condition.pathPattern) {
      fields.push({
        fieldPath: `validationRules[${vRule.name}].condition.pathPattern`,
        patterns: [vRule.condition.pathPattern],
        flags: "", // no flags = case-sensitive
        ruleName: vRule.name,
      });
    }

    // requirement.pattern (case-insensitive)
    if (vRule.requirement.pattern) {
      fields.push({
        fieldPath: `validationRules[${vRule.name}].requirement.pattern`,
        patterns: [vRule.requirement.pattern],
        ruleName: vRule.name,
      });
    }
  }

  return fields;
}

/**
 * Validate a single regex pattern
 *
 * @returns Error message if invalid, null if valid
 */
export function validatePattern(pattern: string, flags = "i"): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
