/**
 * Tests for shadow-triggers module
 *
 * Tests convertMatchesToSuggestions, formatShadowSuggestions
 */

import { describe, it, expect } from 'vitest';
import {
  convertMatchesToSuggestions,
  formatShadowSuggestions,
} from '../shadow-triggers.mjs';
import type { ShadowMatch, ShadowSuggestion } from '../types.mjs';

describe('shadow-triggers', () => {
  describe('convertMatchesToSuggestions()', () => {
    it('formats matches correctly to suggestions', () => {
      const matches: ShadowMatch[] = [
        {
          skillName: 'code-review',
          rule: {
            type: 'workflow',
            enforcement: 'manual',
            priority: 'medium',
            description: 'Review code changes before committing',
          },
          score: 30,
          reason: 'Detected: "review"',
        },
        {
          skillName: 'test-quality',
          rule: {
            type: 'domain',
            enforcement: 'manual',
            priority: 'high',
            description: 'Check test coverage and quality',
          },
          score: 20,
          reason: 'Pattern matched: before.*commit',
        },
      ];

      const suggestions = convertMatchesToSuggestions(matches);

      expect(suggestions).toHaveLength(2);

      const first = suggestions[0]!;
      expect(first.skillName).toBe('code-review');
      expect(first.description).toBe('Review code changes before committing');
      expect(first.reason).toBe('Detected: "review"');
      expect(first.score).toBe(30);

      const second = suggestions[1]!;
      expect(second.skillName).toBe('test-quality');
      expect(second.description).toBe('Check test coverage and quality');
      expect(second.reason).toBe('Pattern matched: before.*commit');
      expect(second.score).toBe(20);
    });

    it('returns empty array for empty matches', () => {
      const suggestions = convertMatchesToSuggestions([]);

      expect(suggestions).toEqual([]);
    });

    it('preserves all fields from match to suggestion', () => {
      const match: ShadowMatch = {
        skillName: 'test-skill',
        rule: {
          type: 'guardrail',
          enforcement: 'manual',
          priority: 'critical',
          description: 'Test description here',
        },
        score: 42,
        reason: 'Test reason',
      };

      const suggestions = convertMatchesToSuggestions([match]);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual({
        skillName: 'test-skill',
        description: 'Test description here',
        reason: 'Test reason',
        score: 42,
      });
    });
  });

  describe('edge cases', () => {
    it('handles match with undefined description gracefully', () => {
      const matches: ShadowMatch[] = [
        {
          skillName: 'no-desc-skill',
          rule: {
            type: 'workflow',
            enforcement: 'manual',
            priority: 'medium',
            description: undefined as unknown as string,
          },
          score: 10,
          reason: 'Test reason',
        },
      ];

      const suggestions = convertMatchesToSuggestions(matches);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.description).toBeUndefined();
    });

    it('handles match with undefined reason gracefully', () => {
      const matches: ShadowMatch[] = [
        {
          skillName: 'no-reason-skill',
          rule: {
            type: 'domain',
            enforcement: 'manual',
            priority: 'high',
            description: 'Valid description',
          },
          score: 20,
          reason: undefined as unknown as string,
        },
      ];

      const suggestions = convertMatchesToSuggestions(matches);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.reason).toBeUndefined();
    });

    it('handles match with empty string fields', () => {
      const matches: ShadowMatch[] = [
        {
          skillName: 'empty-fields',
          rule: {
            type: 'guardrail',
            enforcement: 'manual',
            priority: 'low',
            description: '',
          },
          score: 5,
          reason: '',
        },
      ];

      const suggestions = convertMatchesToSuggestions(matches);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.description).toBe('');
      expect(suggestions[0]!.reason).toBe('');
    });
  });

  describe('formatShadowSuggestions()', () => {
    it('produces readable output with skill info', () => {
      const suggestions: ShadowSuggestion[] = [
        {
          skillName: 'code-review',
          description: 'Review code before committing',
          reason: 'Detected: "commit"',
          score: 30,
        },
        {
          skillName: 'lint-check',
          description: 'Run linting on changed files',
          reason: 'Detected: "changes"',
          score: 20,
        },
      ];

      const output = formatShadowSuggestions(suggestions);

      expect(output).toContain('## Related Skills (may be relevant):');
      expect(output).toContain('/code-review: Review code before committing');
      expect(output).toContain('(Detected: "commit")');
      expect(output).toContain('/lint-check: Run linting on changed files');
      expect(output).toContain('(Detected: "changes")');
      expect(output).toContain('To load a skill, use: /skill-name');
    });

    it('returns empty string for empty suggestions array', () => {
      const output = formatShadowSuggestions([]);

      expect(output).toBe('');
    });

    it('formats single suggestion correctly', () => {
      const suggestions: ShadowSuggestion[] = [
        {
          skillName: 'single-skill',
          description: 'Only one skill suggested',
          reason: 'Single match',
          score: 10,
        },
      ];

      const output = formatShadowSuggestions(suggestions);

      expect(output).toContain('/single-skill');
      expect(output).toContain('Only one skill suggested');
      expect(output).toContain('(Single match)');
      // should still have header and footer
      expect(output).toContain('## Related Skills');
      expect(output).toContain('To load a skill');
    });
  });
});
