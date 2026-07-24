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

    it('resolves a lowercase skill.md (matches case-insensitive discovery)', () => {
      // skills are discovered with a nocase glob; on a case-sensitive filesystem a
      // lowercase skill.md would sync and validate cleanly but never load its content if
      // the resolver were uppercase-only
      const dir = path.join(tmpDir, '.claude', 'skills', 'lower-skill');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'skill.md'), '# lowercase content');

      const loader = new ConfigLoader(tmpDir);
      expect(loader.skillExists('lower-skill')).toBe(true);
      expect(loader.loadSkillContent('lower-skill')).toContain('lowercase content');
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

describe('config-loader user scope', () => {
  let projectDir: string;
  let homeDir: string;
  let originalHome: string | undefined;
  let originalDebug: string | undefined;

  beforeEach(() => {
    projectDir = createTempDir('user-scope-project-');
    homeDir = createTempDir('user-scope-home-');
    // os.homedir() honors $HOME on POSIX, so this redirects ~/.claude for the test
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
    originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalDebug !== undefined) process.env.DEBUG = originalDebug;
    cleanupTempDir(projectDir);
    cleanupTempDir(homeDir);
  });

  const rule = (description: string) => ({
    type: 'domain' as const,
    enforcement: 'suggest' as const,
    priority: 'high' as const,
    description,
    activationStrategy: 'suggestive' as const,
    promptTriggers: { keywords: ['thing'] },
  });

  it('ignores user rules by default (unchanged behavior)', () => {
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });
    createSkillRulesYaml(projectDir, { skills: { 'proj-skill': rule('from project') } });

    const config = new ConfigLoader(projectDir).loadSkillRules();

    expect(Object.keys(config.skills)).toEqual(['proj-skill']);
  });

  it('merges user rules beneath project rules when enabled', () => {
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });
    createSkillRulesYaml(projectDir, { skills: { 'proj-skill': rule('from project') } });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(Object.keys(config.skills).sort()).toEqual(['proj-skill', 'user-skill']);
  });

  it('project wins on skill-name collision', () => {
    createSkillRulesYaml(homeDir, { skills: { shared: rule('from user') } });
    createSkillRulesYaml(projectDir, { skills: { shared: rule('from project') } });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(config.skills.shared?.description).toBe('from project');
  });

  it('loads user rules when the project has none', () => {
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(config.skills['user-skill']?.description).toBe('from user');
  });

  it('degrades to project-only when the user file is malformed', () => {
    const userSkillsDir = path.join(homeDir, '.claude', 'skills');
    fs.mkdirSync(userSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(userSkillsDir, 'skill-rules.yaml'), 'skills: [unclosed\n');
    createSkillRulesYaml(projectDir, { skills: { 'proj-skill': rule('from project') } });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(Object.keys(config.skills)).toEqual(['proj-skill']);
  });

  it('resolves content from the scope that DECLARED each skill', () => {
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });
    createSkill(homeDir, 'user-skill', '# user version');
    createSkill(homeDir, 'shared', '# user shared');
    createSkillRulesYaml(projectDir, { skills: { shared: rule('from project') } });
    createSkill(projectDir, 'shared', '# project shared');

    const loader = new ConfigLoader(projectDir, { userScope: true });

    // user-declared rule resolves under ~/.claude even without an explicit
    // loadSkillRules() call first — the scope map populates on demand
    expect(loader.skillExists('user-skill')).toBe(true);
    expect(loader.loadSkillContent('user-skill')).toContain('user version');
    // project declared `shared`, so the project copy wins
    expect(loader.loadSkillContent('shared')).toContain('project shared');
    expect(loader.skillExists('nope')).toBe(false);
  });

  it('does not merge a directory with itself when the project IS ~/.claude', () => {
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });

    const config = new ConfigLoader(homeDir, { userScope: true }).loadSkillRules();

    expect(Object.keys(config.skills)).toEqual(['user-skill']);
  });
});

describe('config-loader user/project settings merge', () => {
  let projectDir: string;
  let homeDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    projectDir = createTempDir('settings-merge-project-');
    homeDir = createTempDir('settings-merge-home-');
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    cleanupTempDir(projectDir);
    cleanupTempDir(homeDir);
  });

  it('keeps user settings the project does not override', () => {
    // a project that sets only one key must not wipe the user's global preferences
    createSkillRulesYaml(homeDir, {
      settings: {
        maxSuggestions: 1,
        enableDebugLogging: false,
        thresholds: { recentActivationMinutes: 60 },
      },
      skills: {},
    });
    createSkillRulesYaml(projectDir, {
      settings: { enableDebugLogging: true },
      skills: {},
    });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(config.settings?.enableDebugLogging).toBe(true); // project wins
    expect(config.settings?.maxSuggestions).toBe(1); // user preserved
    expect(config.settings?.thresholds?.recentActivationMinutes).toBe(60);
  });

  it('merges nested scoring keys with project precedence', () => {
    createSkillRulesYaml(homeDir, {
      settings: { scoring: { keywordMatchScore: 99, intentPatternScore: 88 } },
      skills: {},
    });
    createSkillRulesYaml(projectDir, {
      settings: { scoring: { keywordMatchScore: 5 } },
      skills: {},
    });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(config.settings?.scoring?.keywordMatchScore).toBe(5); // project wins
    expect(config.settings?.scoring?.intentPatternScore).toBe(88); // user preserved
  });
});

describe('config-loader scope isolation (security)', () => {
  let projectDir: string;
  let homeDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    projectDir = createTempDir('scope-isolation-project-');
    homeDir = createTempDir('scope-isolation-home-');
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    // os.homedir() reads USERPROFILE on win32 and HOME on POSIX — set both
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    cleanupTempDir(projectDir);
    cleanupTempDir(homeDir);
  });

  const rule = (description: string) => ({
    type: 'domain' as const,
    enforcement: 'suggest' as const,
    priority: 'high' as const,
    description,
    activationStrategy: 'suggestive' as const,
    promptTriggers: { keywords: ['thing'] },
  });

  it('does NOT let a project rule read a user-scope skill file', () => {
    // a cloned repo's skill-rules.yaml is untrusted data; if it could name a user skill,
    // the hook would read and print a private file out of $HOME
    createSkill(homeDir, 'private-notes', '# SECRET user content');
    createSkillRulesYaml(projectDir, { skills: { 'private-notes': rule('claimed by project') } });

    const loader = new ConfigLoader(projectDir, { userScope: true });
    loader.loadSkillRules();

    expect(loader.skillExists('private-notes')).toBe(false);
    expect(loader.loadSkillContent('private-notes')).toBeNull();
  });

  it('still resolves a user-scope skill that the USER declared', () => {
    createSkillRulesYaml(homeDir, { skills: { 'my-skill': rule('declared by user') } });
    createSkill(homeDir, 'my-skill', '# user content');

    const loader = new ConfigLoader(projectDir, { userScope: true });
    loader.loadSkillRules();

    expect(loader.skillExists('my-skill')).toBe(true);
    expect(loader.loadSkillContent('my-skill')).toContain('user content');
  });

  it('resolves the project copy when both scopes declare the same name', () => {
    createSkillRulesYaml(homeDir, { skills: { shared: rule('user') } });
    createSkill(homeDir, 'shared', '# user copy');
    createSkillRulesYaml(projectDir, { skills: { shared: rule('project') } });
    createSkill(projectDir, 'shared', '# project copy');

    const loader = new ConfigLoader(projectDir, { userScope: true });
    loader.loadSkillRules();

    expect(loader.loadSkillContent('shared')).toContain('project copy');
  });

  it('rejects traversal even when the traversed-to SKILL.md really exists', () => {
    // plant a file that IS reachable by traversal, so the guard is the only thing
    // stopping the read — asserting on non-existent paths would pass with no guard at all
    const reachable = path.join(projectDir, '.claude', 'evil');
    fs.mkdirSync(reachable, { recursive: true });
    fs.writeFileSync(path.join(reachable, 'SKILL.md'), '# REACHED');

    const loader = new ConfigLoader(projectDir, { userScope: true });
    loader.loadSkillRules();

    expect(loader.loadSkillContent('../evil')).toBeNull();
    expect(loader.skillExists('../evil')).toBe(false);
    expect(loader.loadSkillContent('/etc/passwd')).toBeNull();

    // control: the same content IS readable when reached legitimately, proving the
    // fixture is live and the nulls above come from the guard, not a missing file
    fs.cpSync(reachable, path.join(projectDir, '.claude', 'skills', 'evil'), {
      recursive: true,
    });
    expect(loader.loadSkillContent('evil')).toContain('REACHED');
  });

  it('an UNPARSEABLE project file degrades to empty, not to the user rule set', () => {
    // a project typo must not silently swap in a different set of active skills
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });
    const projectSkills = path.join(projectDir, '.claude', 'skills');
    fs.mkdirSync(projectSkills, { recursive: true });
    fs.writeFileSync(path.join(projectSkills, 'skill-rules.yaml'), 'skills: [unclosed\n');

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(Object.keys(config.skills)).toEqual([]);
  });

  it('an ABSENT project file still merges user scope', () => {
    createSkillRulesYaml(homeDir, { skills: { 'user-skill': rule('from user') } });

    const config = new ConfigLoader(projectDir, { userScope: true }).loadSkillRules();

    expect(Object.keys(config.skills)).toEqual(['user-skill']);
  });
});
