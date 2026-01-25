/**
 * Tests for pattern-utils module
 *
 * Tests extractPatternFields, extractValidationRulePatterns, validatePattern
 */

import { describe, it, expect } from 'vitest';
import {
  extractPatternFields,
  extractValidationRulePatterns,
  validatePattern,
} from '../pattern-utils.mjs';
import type { SkillRule, ValidationRule } from '../types.mjs';

describe('pattern-utils', () => {
  describe('extractPatternFields()', () => {
    it('extracts all 4 pattern types from complete rule', () => {
      const rule: SkillRule = {
        type: 'domain',
        enforcement: 'suggest',
        priority: 'medium',
        description: 'Test skill',
        promptTriggers: {
          intentPatterns: ['pattern1', 'pattern2'],
        },
        fileTriggers: {
          contentPatterns: ['content.*pattern'],
        },
        shadowTriggers: {
          intentPatterns: ['shadow.*pattern'],
        },
        preToolTriggers: {
          toolName: 'Bash',
          inputPatterns: ['rm.*-rf'],
        },
      };

      const fields = extractPatternFields(rule);

      expect(fields.length).toBe(4);
      // verify each pattern type was extracted with correct fieldPath and patterns
      // note: toEqual() will fail with clear message if field is undefined
      const promptField = fields.find(f => f.fieldPath === 'promptTriggers.intentPatterns');
      const contentField = fields.find(f => f.fieldPath === 'fileTriggers.contentPatterns');
      const shadowField = fields.find(f => f.fieldPath === 'shadowTriggers.intentPatterns');
      const preToolField = fields.find(f => f.fieldPath === 'preToolTriggers.inputPatterns');

      expect(promptField?.fieldPath).toBe('promptTriggers.intentPatterns');
      expect(promptField?.patterns).toEqual(['pattern1', 'pattern2']);
      expect(contentField?.fieldPath).toBe('fileTriggers.contentPatterns');
      expect(contentField?.patterns).toEqual(['content.*pattern']);
      expect(shadowField?.fieldPath).toBe('shadowTriggers.intentPatterns');
      expect(shadowField?.patterns).toEqual(['shadow.*pattern']);
      expect(preToolField?.fieldPath).toBe('preToolTriggers.inputPatterns');
      expect(preToolField?.patterns).toEqual(['rm.*-rf']);
    });

    it('returns empty array for rule with no patterns', () => {
      const rule: SkillRule = {
        type: 'domain',
        enforcement: 'suggest',
        priority: 'medium',
        description: 'No patterns',
      };

      const fields = extractPatternFields(rule);

      expect(fields).toEqual([]);
    });

    it('skips empty pattern arrays', () => {
      const rule: SkillRule = {
        type: 'domain',
        enforcement: 'suggest',
        priority: 'medium',
        description: 'Empty arrays',
        promptTriggers: {
          intentPatterns: [],
        },
        fileTriggers: {
          contentPatterns: ['has-content'],
        },
      };

      const fields = extractPatternFields(rule);

      expect(fields).toHaveLength(1);
      expect(fields[0]!.fieldPath).toBe('fileTriggers.contentPatterns');
    });

    it('handles partial trigger definitions', () => {
      const rule: SkillRule = {
        type: 'domain',
        enforcement: 'suggest',
        priority: 'medium',
        description: 'Partial',
        promptTriggers: {
          keywords: ['test'], // keywords are not patterns
        },
      };

      const fields = extractPatternFields(rule);

      expect(fields).toEqual([]);
    });
  });

  describe('extractValidationRulePatterns()', () => {
    it('extracts patterns from condition and requirement', () => {
      const validationRules: ValidationRule[] = [
        {
          name: 'test-rule',
          condition: {
            pattern: 'condition.*pattern',
            pathPattern: 'src/.*\\.ts$',
          },
          requirement: {
            pattern: 'requirement.*pattern',
          },
          reminder: 'Test reminder',
        },
      ];

      const fields = extractValidationRulePatterns(validationRules);

      expect(fields.length).toBe(3);
      expect(fields.find(f => f.fieldPath.includes('condition.pattern'))).toBeDefined();
      expect(fields.find(f => f.fieldPath.includes('condition.pathPattern'))).toBeDefined();
      expect(fields.find(f => f.fieldPath.includes('requirement.pattern'))).toBeDefined();
    });

    it('returns empty array for undefined validationRules', () => {
      const fields = extractValidationRulePatterns(undefined);

      expect(fields).toEqual([]);
    });

    it('handles multiple validation rules', () => {
      const validationRules: ValidationRule[] = [
        {
          name: 'rule-1',
          condition: { pattern: 'p1' },
          requirement: { pattern: 'r1' },
          reminder: 'R1',
        },
        {
          name: 'rule-2',
          condition: { pathPattern: 'path.*' },
          requirement: { pattern: 'r2' },
          reminder: 'R2',
        },
      ];

      const fields = extractValidationRulePatterns(validationRules);

      expect(fields.length).toBe(4); // 2 from rule-1, 2 from rule-2
    });

    it('uses empty flags for pathPattern (case-sensitive)', () => {
      const validationRules: ValidationRule[] = [
        {
          name: 'path-rule',
          condition: { pathPattern: 'src/Api/.*' },
          requirement: {},
          reminder: 'Test',
        },
      ];

      const fields = extractValidationRulePatterns(validationRules);

      const pathField = fields.find(f => f.fieldPath.includes('pathPattern'));
      expect(pathField?.flags).toBe('');
    });

    it('includes ruleName for error context', () => {
      const validationRules: ValidationRule[] = [
        {
          name: 'my-rule',
          condition: { pattern: 'test' },
          requirement: {},
          reminder: 'Test',
        },
      ];

      const fields = extractValidationRulePatterns(validationRules);

      expect(fields).toHaveLength(1);
      expect(fields[0]!.ruleName).toBe('my-rule');
    });
  });

  describe('validatePattern()', () => {
    it('returns null for valid regex pattern', () => {
      const result = validatePattern('test.*pattern');

      expect(result).toBeNull();
    });

    it('returns null for complex valid regex', () => {
      const result = validatePattern('^(?:https?:\\/\\/)?[\\w.-]+(?:\\.[a-z]{2,})+');

      expect(result).toBeNull();
    });

    it('returns error message for invalid regex', () => {
      const result = validatePattern('[[invalid');

      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });

    it('returns error for unclosed group', () => {
      const result = validatePattern('(unclosed');

      expect(result).not.toBeNull();
    });

    it('validates with custom flags', () => {
      // valid pattern with global flag
      const result = validatePattern('test', 'gi');

      expect(result).toBeNull();
    });

    it('returns error for invalid flags', () => {
      // 'z' is not a valid regex flag
      const result = validatePattern('test', 'z');

      expect(result).not.toBeNull();
    });
  });
});
