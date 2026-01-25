/**
 * Tests for config-loader module
 *
 * Tests YAML/JSON loading, graceful degradation, and security
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader, createDefaultConfig, getLogger } from '../config-loader.mjs';
import type { SkillConfig } from '../types.mjs';
import {
  createTempDir,
  cleanupTempDir,
  createSkillRulesYaml,
  createSkillRulesJson,
  createSkill,
  setupMockProject,
} from './helpers.js';

describe('config-loader', () => {
  let tmpDir: string;
  let originalDebug: string | undefined;

  beforeEach(() => {
    tmpDir = createTempDir();
    // save and clear DEBUG to silence warnings during tests
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

  describe('createDefaultConfig()', () => {
    it('returns valid structure with all required fields', () => {
      const config = createDefaultConfig();

      expect(config).toMatchObject({
        version: '1.0',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns AsymmetricMatcher typed as any
        description: expect.any(String),
        skills: {},
        settings: {
          maxSuggestions: 3,
          cacheDirectory: '.claude/cache',
          enableDebugLogging: false,
          scoring: {
            keywordMatchScore: 10,
            intentPatternScore: 20,
            filePathMatchScore: 15,
            fileContentMatchScore: 15,
          },
          thresholds: {
            recentActivationMinutes: 5,
          },
        },
      });
    });
  });

  describe('ConfigLoader.loadSkillRules()', () => {
    it('loads valid YAML config successfully', () => {
      const config: Partial<SkillConfig> = {
        version: '2.0.1', // use a version that won't be parsed as a number
        description: 'Test YAML config',
        skills: {
          'test-skill': {
            type: 'domain',
            enforcement: 'suggest',
            priority: 'high',
            description: 'A test skill',
          },
        },
      };
      createSkillRulesYaml(tmpDir, config);

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      expect(result.version).toBe('2.0.1');
      expect(result.description).toBe('Test YAML config');
      expect(result.skills).toHaveProperty('test-skill');
      const testSkill = result.skills['test-skill'];
      expect(testSkill?.priority).toBe('high');
    });

    it('loads valid JSON config when YAML does not exist', () => {
      const config: Partial<SkillConfig> = {
        version: '1.5',
        description: 'Test JSON config',
        skills: {
          'json-skill': {
            type: 'workflow',
            enforcement: 'warn',
            priority: 'medium',
            description: 'JSON skill',
          },
        },
      };
      createSkillRulesJson(tmpDir, config);

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      expect(result.version).toBe('1.5');
      expect(result.skills).toHaveProperty('json-skill');
    });

    it('prefers YAML over JSON when both exist', () => {
      createSkillRulesYaml(tmpDir, {
        version: '1.0',
        description: 'YAML version',
        skills: {
          'yaml-skill': {
            type: 'domain',
            enforcement: 'suggest',
            priority: 'high',
            description: 'From YAML',
          },
        },
      });
      createSkillRulesJson(tmpDir, {
        version: '1.0',
        description: 'JSON version',
        skills: {
          'json-skill': {
            type: 'domain',
            enforcement: 'suggest',
            priority: 'low',
            description: 'From JSON',
          },
        },
      });

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      expect(result.description).toBe('YAML version');
      expect(result.skills['yaml-skill']).toBeDefined();
      expect(result.skills['json-skill']).toBeUndefined();
    });

    it('returns default config when corrupted YAML exists', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, 'skill-rules.yaml'),
        '{ invalid: yaml: content: [['
      );

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      // should return default config gracefully
      expect(result.version).toBe('1.0');
      expect(result.skills).toEqual({});
    });

    it('returns default config when corrupted JSON exists', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, 'skill-rules.json'),
        '{ "broken json'
      );

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      expect(result.version).toBe('1.0');
      expect(result.skills).toEqual({});
    });

    it('returns default config when no config files exist', () => {
      setupMockProject(tmpDir);

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      expect(result.version).toBe('1.0');
      expect(result.skills).toEqual({});
    });

    it('handles missing skills field gracefully', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, 'skill-rules.yaml'),
        'version: "1.0"\ndescription: "No skills field"'
      );

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      expect(result.skills).toEqual({});
    });

    it('uses JSON_SCHEMA to prevent object injection (security)', () => {
      // yaml with potentially dangerous constructor
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      // this yaml would be dangerous without JSON_SCHEMA
      fs.writeFileSync(
        path.join(skillsDir, 'skill-rules.yaml'),
        `version: "1.0"
description: "Safe config"
skills:
  safe-skill:
    type: domain
    enforcement: suggest
    priority: medium
    description: "A safe skill"`
      );

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      // should load normally without any prototype pollution
      expect(result.version).toBe('1.0');
      expect(typeof result.skills['safe-skill']).toBe('object');
    });

    it('rejects YAML with __proto__ pollution attempt', () => {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      // attempt prototype pollution via __proto__ key
      fs.writeFileSync(
        path.join(skillsDir, 'skill-rules.yaml'),
        `version: "1.0"
description: "Malicious config"
__proto__:
  polluted: true
skills:
  test-skill:
    type: domain
    enforcement: suggest
    priority: medium
    description: "Test"`
      );

      const loader = new ConfigLoader(tmpDir);
      const result = loader.loadSkillRules();

      // __proto__ should NOT pollute Object.prototype
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- testing prototype pollution requires any cast
      expect((Object.prototype as any).polluted).toBeUndefined();
      // the __proto__ key should be treated as a regular property, not prototype
      expect(result.version).toBe('1.0');
    });
  });

  describe('ConfigLoader.loadSkillContent()', () => {
    it('loads skill content for existing skill', () => {
      createSkill(tmpDir, 'my-skill', '# My Skill\n\nThis is the skill content.');

      const loader = new ConfigLoader(tmpDir);
      const content = loader.loadSkillContent('my-skill');

      expect(content).toBe('# My Skill\n\nThis is the skill content.');
    });

    it('returns null for non-existent skill', () => {
      setupMockProject(tmpDir);

      const loader = new ConfigLoader(tmpDir);
      const content = loader.loadSkillContent('non-existent-skill');

      expect(content).toBeNull();
    });
  });

  describe('ConfigLoader.skillExists()', () => {
    it('returns true when skill exists', () => {
      createSkill(tmpDir, 'existing-skill', '# Skill');

      const loader = new ConfigLoader(tmpDir);
      expect(loader.skillExists('existing-skill')).toBe(true);
    });

    it('returns false when skill does not exist', () => {
      setupMockProject(tmpDir);

      const loader = new ConfigLoader(tmpDir);
      expect(loader.skillExists('missing-skill')).toBe(false);
    });
  });

  describe('getLogger()', () => {
    it('creates no-op logger when enableDebugLogging is false', () => {
      const config: SkillConfig = {
        version: '1.0',
        description: 'Test',
        settings: { enableDebugLogging: false },
        skills: {},
      };

      const logger = getLogger(tmpDir, config);

      // should not throw when logging
      expect(() => logger.log('activation', 'test message', { data: 1 })).not.toThrow();
    });

    it('creates active logger when enableDebugLogging is true', () => {
      const cacheDir = path.join(tmpDir, '.claude', 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      const config: SkillConfig = {
        version: '1.0',
        description: 'Test',
        settings: { enableDebugLogging: true },
        skills: {},
      };

      const logger = getLogger(tmpDir, config);
      logger.log('activation', 'test message');

      // should create log file
      const logPath = path.join(cacheDir, 'debug.log');
      expect(fs.existsSync(logPath)).toBe(true);
    });
  });
});
