/**
 * Tests for rule-matcher module
 *
 * Tests prompt/file matching, shadow/pre-tool/stop triggers, validation rules
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleMatcher } from '../rule-matcher.mjs';
import type { SkillMatch } from '../types.mjs';
import {
  createTempDir,
  cleanupTempDir,
  setupMockProject,
  createTestFile,
  createMinimalConfig,
  defaultSkillRule,
} from './helpers.js';

describe('rule-matcher', () => {
  let tmpDir: string;
  let originalDebug: string | undefined;

  beforeEach(() => {
    tmpDir = createTempDir();
    setupMockProject(tmpDir);
    // save and clear DEBUG
    originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
    // restore original DEBUG value
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
  });

  describe('matchPrompt()', () => {
    it('matches prompt with keyword', () => {
      const config = createMinimalConfig({
        'test-skill': {
          ...defaultSkillRule,
          promptTriggers: {
            keywords: ['refactor', 'optimize'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('Please refactor this code');

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.skillName).toBe('test-skill');
      expect(match.promptMatch).toBe(true);
      expect(match.score).toBe(10); // default keyword score
    });

    it('matches prompt with intent pattern (regex)', () => {
      const config = createMinimalConfig({
        'tdd-skill': {
          ...defaultSkillRule,
          promptTriggers: {
            intentPatterns: ['implement.*with tests', 'write.*test.*first'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('implement the feature with tests please');

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.skillName).toBe('tdd-skill');
      expect(match.score).toBe(20); // default intent pattern score
    });

    it('combines keyword and intent pattern scores', () => {
      const config = createMinimalConfig({
        'combo-skill': {
          ...defaultSkillRule,
          promptTriggers: {
            keywords: ['test'],
            intentPatterns: ['implement.*feature'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('implement test feature');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.score).toBe(30); // 10 + 20
    });

    it('returns empty array for empty prompt and files', () => {
      const config = createMinimalConfig({
        'skill': {
          ...defaultSkillRule,
          promptTriggers: { keywords: ['specific'] },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('', []);

      expect(matches).toEqual([]);
    });

    it('skips manual-only skills for auto-loading', () => {
      const config = createMinimalConfig({
        'manual-skill': {
          ...defaultSkillRule,
          enforcement: 'manual',
          promptTriggers: { keywords: ['test'] },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('test something');

      expect(matches).toEqual([]);
    });
  });

  describe('matchFiles()', () => {
    it('matches file with path pattern only (no content)', () => {
      createTestFile(tmpDir, 'src/api/users.ts', 'export const users = [];');

      const config = createMinimalConfig({
        'api-skill': {
          ...defaultSkillRule,
          fileTriggers: {
            pathPatterns: ['src/api/**/*.ts'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('work on api', ['src/api/users.ts']);

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.fileMatch).toBe(true);
      expect(match.score).toBe(15); // default file path score
    });

    it('matches file with content pattern (regex)', () => {
      createTestFile(tmpDir, 'src/app.ts', 'import express from "express";');

      const config = createMinimalConfig({
        'express-skill': {
          ...defaultSkillRule,
          fileTriggers: {
            contentPatterns: ['express|fastify'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('', ['src/app.ts']);

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.fileMatch).toBe(true);
      expect(match.score).toBe(15); // content score
    });

    it('returns 0 when path matches but content fails (path+content required)', () => {
      createTestFile(tmpDir, 'src/api/handler.ts', 'export function handler() {}');

      const config = createMinimalConfig({
        'express-api-skill': {
          ...defaultSkillRule,
          fileTriggers: {
            pathPatterns: ['src/api/**/*.ts'],
            contentPatterns: ['express|fastify'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('', ['src/api/handler.ts']);

      expect(matches).toEqual([]);
    });

    it('scores correctly when both path and content match', () => {
      createTestFile(tmpDir, 'src/api/app.ts', 'import express from "express";');

      const config = createMinimalConfig({
        'full-match-skill': {
          ...defaultSkillRule,
          fileTriggers: {
            pathPatterns: ['src/api/**/*.ts'],
            contentPatterns: ['express'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('', ['src/api/app.ts']);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.score).toBe(30); // 15 path + 15 content
    });

    it('skips files larger than 1MB (memory protection)', () => {
      // create a file over 1MB - content pattern should not be checked
      const largeContent = 'a'.repeat(1024 * 1024 + 100); // slightly over 1MB
      createTestFile(tmpDir, 'large-file.ts', largeContent);

      const config = createMinimalConfig({
        'big-file-skill': {
          ...defaultSkillRule,
          fileTriggers: {
            pathPatterns: ['**/*.ts'],
            contentPatterns: ['a'], // would match if file was read
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      // file exists but is too large - content should be skipped
      const matches = matcher.matchPrompt('', ['large-file.ts']);

      // should not match because content check is skipped for large files
      expect(matches).toEqual([]);
    });

    it('handles file read errors gracefully', () => {
      const config = createMinimalConfig({
        'error-skill': {
          ...defaultSkillRule,
          fileTriggers: {
            pathPatterns: ['**/*.ts'],
            contentPatterns: ['pattern'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      // non-existent file should not throw
      expect(() => matcher.matchPrompt('', ['does-not-exist.ts'])).not.toThrow();
    });
  });

  describe('matchShadowTriggers()', () => {
    it('matches shadow triggers with keywords', () => {
      const config = createMinimalConfig({
        'shadow-skill': {
          ...defaultSkillRule,
          shadowTriggers: {
            keywords: ['review', 'check'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchShadowTriggers('please review this code');

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.skillName).toBe('shadow-skill');
      expect(match.reason).toContain('review');
    });

    it('matches shadow triggers with intent patterns', () => {
      const config = createMinimalConfig({
        'shadow-intent-skill': {
          ...defaultSkillRule,
          shadowTriggers: {
            intentPatterns: ['before.*commit'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchShadowTriggers('run checks before commit');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.skillName).toBe('shadow-intent-skill');
    });
  });

  describe('matchPreToolTriggers()', () => {
    it('matches by tool name only (no input patterns)', () => {
      const config = createMinimalConfig({
        'bash-guard': {
          ...defaultSkillRule,
          preToolTriggers: {
            toolName: 'Bash',
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPreToolTriggers('Bash', 'rm -rf /');

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.skillName).toBe('bash-guard');
      expect(match.toolName).toBe('Bash');
    });

    it('matches by tool name and input pattern', () => {
      const config = createMinimalConfig({
        'git-push-guard': {
          ...defaultSkillRule,
          preToolTriggers: {
            toolName: 'Bash',
            inputPatterns: ['git.*push.*--force'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPreToolTriggers('Bash', 'git push --force origin main');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.matchedPattern).toBe('git.*push.*--force');
    });

    it('does not match when tool name differs', () => {
      const config = createMinimalConfig({
        'bash-only': {
          ...defaultSkillRule,
          preToolTriggers: {
            toolName: 'Bash',
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPreToolTriggers('Read', 'some input');

      expect(matches).toEqual([]);
    });
  });

  describe('matchStopTriggers()', () => {
    it('matches stop trigger keywords', () => {
      const config = createMinimalConfig({
        'verify-skill': {
          ...defaultSkillRule,
          stopTriggers: {
            keywords: ['done', 'complete', 'finished'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchStopTriggers('I have finished implementing the feature');

      expect(matches).toHaveLength(1);
      const match = matches[0]!;
      expect(match.skillName).toBe('verify-skill');
      expect(match.matchedKeyword).toBe('finished');
    });

    it('indicates when prompt evaluation is required', () => {
      const config = createMinimalConfig({
        'prompt-eval-skill': {
          ...defaultSkillRule,
          stopTriggers: {
            keywords: ['done'],
            promptEvaluation: 'Is the work actually complete?',
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchStopTriggers('I am done');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.requiresPromptEvaluation).toBe(true);
    });
  });

  describe('applyValidationRules()', () => {
    it('emits reminder when condition matches but requirement fails', () => {
      createTestFile(tmpDir, 'src/api/endpoint.ts', 'export function handler() {}');

      const config = createMinimalConfig({
        'auth-guardrail': {
          ...defaultSkillRule,
          priority: 'high',
          validationRules: [
            {
              name: 'requires-auth',
              condition: {
                pathPattern: 'src/api/.*\\.ts$',
              },
              requirement: {
                pattern: 'authenticate|auth',
              },
              reminder: 'API endpoints should have authentication',
            },
          ],
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const reminders = matcher.applyValidationRules(
        ['src/api/endpoint.ts'],
        ['auth-guardrail']
      );

      expect(reminders).toHaveLength(1);
      const reminder = reminders[0]!;
      expect(reminder.ruleName).toBe('requires-auth');
      expect(reminder.failedFiles).toContain('src/api/endpoint.ts');
    });

    it('emits no reminder when condition matches and requirement passes', () => {
      createTestFile(tmpDir, 'src/api/secure.ts', 'import { authenticate } from "./auth";');

      const config = createMinimalConfig({
        'auth-guardrail': {
          ...defaultSkillRule,
          validationRules: [
            {
              name: 'requires-auth',
              condition: {
                pathPattern: 'src/api/.*\\.ts$',
              },
              requirement: {
                pattern: 'authenticate|auth',
              },
              reminder: 'API endpoints should have authentication',
            },
          ],
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const reminders = matcher.applyValidationRules(
        ['src/api/secure.ts'],
        ['auth-guardrail']
      );

      expect(reminders).toEqual([]);
    });

    it('sorts reminders by skill priority (critical > high > medium > low)', () => {
      createTestFile(tmpDir, 'src/file.ts', 'some content');

      const config = createMinimalConfig({
        'low-priority': {
          ...defaultSkillRule,
          priority: 'low',
          validationRules: [
            {
              name: 'low-rule',
              condition: { pathPattern: '.*\\.ts$' },
              requirement: { pattern: 'never-matches-xyz' },
              reminder: 'Low priority reminder',
            },
          ],
        },
        'critical-priority': {
          ...defaultSkillRule,
          priority: 'critical',
          validationRules: [
            {
              name: 'critical-rule',
              condition: { pathPattern: '.*\\.ts$' },
              requirement: { pattern: 'never-matches-xyz' },
              reminder: 'Critical reminder',
            },
          ],
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const reminders = matcher.applyValidationRules(
        ['src/file.ts'],
        ['low-priority', 'critical-priority']
      );

      expect(reminders).toHaveLength(2);
      expect(reminders[0]!.skillName).toBe('critical-priority');
      expect(reminders[1]!.skillName).toBe('low-priority');
    });

    it('handles invalid regex pattern as non-match', () => {
      createTestFile(tmpDir, 'src/file.ts', 'content');

      const config = createMinimalConfig({
        'bad-regex': {
          ...defaultSkillRule,
          validationRules: [
            {
              name: 'bad-rule',
              condition: {
                pathPattern: '[[invalid regex',
              },
              requirement: { pattern: 'test' },
              reminder: 'Should not appear',
            },
          ],
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      // should not throw
      expect(() =>
        matcher.applyValidationRules(['src/file.ts'], ['bad-regex'])
      ).not.toThrow();
    });

    it('substitutes ${filename} in fileExists requirement', () => {
      createTestFile(tmpDir, 'src/component.tsx', '<div>Component</div>');
      createTestFile(tmpDir, 'src/component.test.tsx', 'test("renders", () => {});');

      const config = createMinimalConfig({
        'test-file-check': {
          ...defaultSkillRule,
          validationRules: [
            {
              name: 'requires-test',
              condition: {
                pathPattern: 'src/.*\\.tsx$',
              },
              requirement: {
                fileExists: '${filename}.test.tsx',
              },
              reminder: 'Component needs test file',
            },
          ],
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const reminders = matcher.applyValidationRules(
        ['src/component.tsx'],
        ['test-file-check']
      );

      // test file exists, so no reminder
      expect(reminders).toEqual([]);
    });
  });

  describe('limitMatches()', () => {
    it('includes all critical skills regardless of limit', () => {
      const critical1 = { ...defaultSkillRule, priority: 'critical' as const };
      const critical2 = { ...defaultSkillRule, priority: 'critical' as const };
      const high1 = { ...defaultSkillRule, priority: 'high' as const };

      const config = createMinimalConfig({
        'critical-1': critical1,
        'critical-2': critical2,
        'high-1': high1,
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const allMatches: SkillMatch[] = [
        { skillName: 'critical-1', rule: critical1, score: 10, promptMatch: true, fileMatch: false },
        { skillName: 'critical-2', rule: critical2, score: 10, promptMatch: true, fileMatch: false },
        { skillName: 'high-1', rule: high1, score: 10, promptMatch: true, fileMatch: false },
      ];

      // limit to 1, but should include both critical
      const limited = matcher.limitMatches(allMatches, 1);

      expect(limited.filter(m => m.rule.priority === 'critical')).toHaveLength(2);
    });

    it('limits non-critical skills to maxSuggestions minus critical count', () => {
      const critical1 = { ...defaultSkillRule, priority: 'critical' as const };
      const high1 = { ...defaultSkillRule, priority: 'high' as const };
      const high2 = { ...defaultSkillRule, priority: 'high' as const };
      const high3 = { ...defaultSkillRule, priority: 'high' as const };

      const config = createMinimalConfig({
        'critical-1': critical1,
        'high-1': high1,
        'high-2': high2,
        'high-3': high3,
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const allMatches: SkillMatch[] = [
        { skillName: 'critical-1', rule: critical1, score: 10, promptMatch: true, fileMatch: false },
        { skillName: 'high-1', rule: high1, score: 10, promptMatch: true, fileMatch: false },
        { skillName: 'high-2', rule: high2, score: 10, promptMatch: true, fileMatch: false },
        { skillName: 'high-3', rule: high3, score: 10, promptMatch: true, fileMatch: false },
      ];

      // limit to 3: 1 critical + 2 high
      const limited = matcher.limitMatches(allMatches, 3);

      expect(limited).toHaveLength(3);
      expect(limited.filter(m => m.rule.priority === 'critical')).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty skills object gracefully', () => {
      const config = createMinimalConfig({});

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('test prompt', []);

      expect(matches).toEqual([]);
    });

    it('handles null/undefined skills object gracefully', () => {
      const config = {
        version: '1.0',
        description: 'Test',
        skills: null as unknown as Record<string, never>,
      };

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('test');
      expect(matches).toEqual([]);
    });

    it('handles empty pattern arrays', () => {
      const config = createMinimalConfig({
        'empty-patterns': {
          ...defaultSkillRule,
          promptTriggers: {
            keywords: [],
            intentPatterns: [],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      expect(() => matcher.matchPrompt('test')).not.toThrow();
    });

    it('handles invalid regex in intent patterns gracefully', () => {
      const config = createMinimalConfig({
        'bad-regex-skill': {
          ...defaultSkillRule,
          promptTriggers: {
            intentPatterns: ['[[invalid regex'],
          },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      // should not throw - invalid patterns are skipped
      expect(() => matcher.matchPrompt('test prompt')).not.toThrow();
    });

    it('sorts matches by priority then score', () => {
      const config = createMinimalConfig({
        'high-priority': {
          ...defaultSkillRule,
          priority: 'high',
          promptTriggers: { keywords: ['test'] },
        },
        'critical-priority': {
          ...defaultSkillRule,
          priority: 'critical',
          promptTriggers: { keywords: ['test'] },
        },
        'low-priority': {
          ...defaultSkillRule,
          priority: 'low',
          promptTriggers: { keywords: ['test'] },
        },
      });

      const matcher = new RuleMatcher(config, tmpDir);
      const matches = matcher.matchPrompt('test something');

      expect(matches).toHaveLength(3);
      expect(matches[0]!.rule.priority).toBe('critical');
      expect(matches[1]!.rule.priority).toBe('high');
      expect(matches[2]!.rule.priority).toBe('low');
    });
  });
});
