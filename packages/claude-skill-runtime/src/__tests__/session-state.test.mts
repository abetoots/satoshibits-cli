/**
 * Tests for session-state module
 *
 * Tests session persistence, file locking, cleanup, and domain detection
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sessionState } from '../session-state.mjs';
import {
  createTempDir,
  cleanupTempDir,
  createSession,
  createCorruptedSession,
  setupFakeTimers,
  restoreFakeTimers,
} from './helpers.js';

// note: these tests modify the singleton sessionState and must run sequentially.
// vitest runs tests in a single file sequentially by default, so this is safe.
// do not use --threads or --pool=threads for this test file.
describe('session-state', () => {
  let tmpDir: string;
  let originalDebug: string | undefined;

  beforeEach(() => {
    tmpDir = createTempDir();
    // reset singleton state
    sessionState.init(tmpDir);
    // save and clear DEBUG
    originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
    restoreFakeTimers();
    // restore original DEBUG value
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
  });

  describe('getSession()', () => {
    it('returns empty session for non-existent session', () => {
      const session = sessionState.getSession('new-session');

      expect(session.modifiedFiles).toEqual([]);
      expect(session.activeDomains).toEqual([]);
      expect(session.lastActivatedSkills).toEqual({});
      expect(session.currentPromptSkills).toEqual([]);
      expect(session.toolUseCount).toBe(0);
      expect(typeof session.createdAt).toBe('number');
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('returns existing session from disk', () => {
      createSession(tmpDir, 'existing-session', {
        modifiedFiles: ['file1.ts', 'file2.ts'],
        activeDomains: ['backend'],
        lastActivatedSkills: { 'my-skill': Date.now() },
        currentPromptSkills: ['my-skill'],
        toolUseCount: 5,
        createdAt: 1000000,
      });

      const session = sessionState.getSession('existing-session');

      expect(session.modifiedFiles).toEqual(['file1.ts', 'file2.ts']);
      expect(session.activeDomains).toEqual(['backend']);
      expect(session.toolUseCount).toBe(5);
      expect(session.createdAt).toBe(1000000);
    });

    it('handles corrupted session JSON with recovery', () => {
      createCorruptedSession(tmpDir, 'corrupted-session');

      const session = sessionState.getSession('corrupted-session');

      // should create a new session
      expect(session.modifiedFiles).toEqual([]);
      expect(session.toolUseCount).toBe(0);
    });

    it('normalizes session with missing fields (backward compatibility)', () => {
      const cacheDir = path.join(tmpDir, '.claude', 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      // write session with only some fields (old format)
      fs.writeFileSync(
        path.join(cacheDir, 'session-old-format.json'),
        JSON.stringify({ modifiedFiles: ['a.ts'] })
      );

      const session = sessionState.getSession('old-format');

      // missing fields should be patched with defaults
      expect(session.activeDomains).toEqual([]);
      expect(session.lastActivatedSkills).toEqual({});
      expect(session.currentPromptSkills).toEqual([]);
      expect(session.toolUseCount).toBe(0);
    });
  });

  describe('addModifiedFile()', () => {
    it('appends file to modified files list', () => {
      sessionState.addModifiedFile('test-session', 'src/new-file.ts');

      const session = sessionState.getSession('test-session');
      expect(session.modifiedFiles).toContain('src/new-file.ts');
    });

    it('does not duplicate files when adding same file twice', () => {
      sessionState.addModifiedFile('test-session', 'src/same-file.ts');
      sessionState.addModifiedFile('test-session', 'src/same-file.ts');

      const session = sessionState.getSession('test-session');
      expect(session.modifiedFiles.filter(f => f === 'src/same-file.ts').length).toBe(1);
    });

    it('does not update activeDomains when domain detection returns null', () => {
      sessionState.addModifiedFile('test-session', 'random/path/file.txt');

      const session = sessionState.getSession('test-session');
      expect(session.activeDomains).toEqual([]);
    });
  });

  describe('domain detection', () => {
    it('detects backend domain from file paths', () => {
      sessionState.addModifiedFile('test-session', 'backend/api/users.ts');

      const domains = sessionState.getActiveDomains('test-session');
      expect(domains).toContain('backend');
    });

    it('detects frontend domain from file paths', () => {
      sessionState.addModifiedFile('test-session', 'frontend/components/Button.tsx');

      const domains = sessionState.getActiveDomains('test-session');
      expect(domains).toContain('frontend');
    });

    it('detects testing domain from file paths', () => {
      sessionState.addModifiedFile('test-session', 'tests/unit/app.test.ts');

      const domains = sessionState.getActiveDomains('test-session');
      expect(domains).toContain('testing');
    });

    it('detects database domain from file paths', () => {
      sessionState.addModifiedFile('test-session', 'prisma/migrations/001_init.ts');

      const domains = sessionState.getActiveDomains('test-session');
      expect(domains).toContain('database');
    });

    it('detects devops domain from file paths', () => {
      sessionState.addModifiedFile('test-session', 'docker/Dockerfile.prod');

      const domains = sessionState.getActiveDomains('test-session');
      expect(domains).toContain('devops');
    });
  });

  describe('recordSkillActivation()', () => {
    it('updates lastActivatedSkills with timestamp', () => {
      setupFakeTimers('2024-01-15T10:00:00Z');
      const expectedTimestamp = Date.now();

      sessionState.recordSkillActivation('test-session', 'my-skill');

      const session = sessionState.getSession('test-session');
      expect(session.lastActivatedSkills['my-skill']).toBe(expectedTimestamp);
    });

    it('adds skill to currentPromptSkills', () => {
      sessionState.recordSkillActivation('test-session', 'my-skill');

      const session = sessionState.getSession('test-session');
      expect(session.currentPromptSkills).toContain('my-skill');
    });
  });

  describe('clearCurrentPromptSkills()', () => {
    it('resets currentPromptSkills array', () => {
      sessionState.recordSkillActivation('test-session', 'skill-1');
      sessionState.recordSkillActivation('test-session', 'skill-2');

      sessionState.clearCurrentPromptSkills('test-session');

      const session = sessionState.getSession('test-session');
      expect(session.currentPromptSkills).toEqual([]);
    });
  });

  describe('wasRecentlyActivated()', () => {
    it('returns false for never-activated skill', () => {
      const result = sessionState.wasRecentlyActivated('test-session', 'never-activated');
      expect(result).toBe(false);
    });

    it('returns true within default threshold (5 minutes)', () => {
      setupFakeTimers('2024-01-15T10:00:00Z');
      sessionState.recordSkillActivation('test-session', 'recent-skill');

      // advance 4 minutes (under 5 minute threshold)
      vi.setSystemTime(new Date('2024-01-15T10:04:00Z'));

      const result = sessionState.wasRecentlyActivated('test-session', 'recent-skill');
      expect(result).toBe(true);
    });

    it('returns false after threshold exceeded', () => {
      setupFakeTimers('2024-01-15T10:00:00Z');
      sessionState.recordSkillActivation('test-session', 'old-skill');

      // advance 6 minutes (over 5 minute default threshold)
      vi.setSystemTime(new Date('2024-01-15T10:06:00Z'));

      const result = sessionState.wasRecentlyActivated('test-session', 'old-skill');
      expect(result).toBe(false);
    });

    it('uses custom threshold when provided', () => {
      setupFakeTimers('2024-01-15T10:00:00Z');
      sessionState.recordSkillActivation('test-session', 'custom-skill');

      // advance 2 minutes
      vi.setSystemTime(new Date('2024-01-15T10:02:00Z'));

      // 1 minute threshold (60000ms)
      const result = sessionState.wasRecentlyActivated('test-session', 'custom-skill', 60000);
      expect(result).toBe(false);
    });
  });

  describe('incrementToolUseCount() / getToolUseCount()', () => {
    it('increments tool use counter', () => {
      sessionState.incrementToolUseCount('test-session');
      sessionState.incrementToolUseCount('test-session');
      sessionState.incrementToolUseCount('test-session');

      const count = sessionState.getToolUseCount('test-session');
      expect(count).toBe(3);
    });

    it('returns 0 for new session', () => {
      const count = sessionState.getToolUseCount('new-session');
      expect(count).toBe(0);
    });
  });

  describe('getAllActivatedSkills()', () => {
    it('returns all skill names from lastActivatedSkills', () => {
      sessionState.recordSkillActivation('test-session', 'skill-a');
      sessionState.recordSkillActivation('test-session', 'skill-b');
      sessionState.recordSkillActivation('test-session', 'skill-c');

      const skills = sessionState.getAllActivatedSkills('test-session');
      expect(skills).toContain('skill-a');
      expect(skills).toContain('skill-b');
      expect(skills).toContain('skill-c');
      expect(skills.length).toBe(3);
    });
  });

  describe('pruneStaleActivations()', () => {
    it('removes activations older than threshold', () => {
      setupFakeTimers('2024-01-15T10:00:00Z');
      sessionState.recordSkillActivation('test-session', 'old-skill');

      // advance 2 hours
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
      sessionState.recordSkillActivation('test-session', 'new-skill');

      // prune with 1 hour threshold
      sessionState.pruneStaleActivations('test-session', 3600000);

      const skills = sessionState.getAllActivatedSkills('test-session');
      expect(skills).not.toContain('old-skill');
      expect(skills).toContain('new-skill');
    });
  });

  describe('cleanupOldSessions()', () => {
    it('removes sessions older than threshold', () => {
      setupFakeTimers('2024-01-15T10:00:00Z');

      // create old session (48 hours old)
      createSession(tmpDir, 'old-session', {
        createdAt: Date.now() - 48 * 60 * 60 * 1000,
      });

      // create recent session
      createSession(tmpDir, 'recent-session', {
        createdAt: Date.now(),
      });

      sessionState.cleanupOldSessions(24 * 60 * 60 * 1000); // 24 hour threshold

      const cacheDir = path.join(tmpDir, '.claude', 'cache');
      expect(fs.existsSync(path.join(cacheDir, 'session-old-session.json'))).toBe(false);
      expect(fs.existsSync(path.join(cacheDir, 'session-recent-session.json'))).toBe(true);
    });

    it('removes orphaned .tmp files older than 5 minutes', () => {
      const cacheDir = path.join(tmpDir, '.claude', 'cache');

      // create old temp file
      const tmpPath = path.join(cacheDir, 'session-test.json.tmp');
      fs.writeFileSync(tmpPath, '{}');

      // set mtime to 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(tmpPath, tenMinutesAgo, tenMinutesAgo);

      sessionState.cleanupOldSessions();

      expect(fs.existsSync(tmpPath)).toBe(false);
    });

    it('preserves recent .tmp files (< 5 minutes old)', () => {
      const cacheDir = path.join(tmpDir, '.claude', 'cache');

      // create recent temp file
      const tmpPath = path.join(cacheDir, 'session-recent.json.tmp');
      fs.writeFileSync(tmpPath, '{}');
      // default mtime is now, which is < 5 min

      sessionState.cleanupOldSessions();

      expect(fs.existsSync(tmpPath)).toBe(true);
    });

    it('removes orphaned .lock files older than 5 minutes', () => {
      const cacheDir = path.join(tmpDir, '.claude', 'cache');

      // create old lock file
      const lockPath = path.join(cacheDir, 'session-test.json.lock');
      fs.writeFileSync(lockPath, '');

      // set mtime to 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(lockPath, tenMinutesAgo, tenMinutesAgo);

      sessionState.cleanupOldSessions();

      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('preserves recent .lock files (< 5 minutes old)', () => {
      const cacheDir = path.join(tmpDir, '.claude', 'cache');

      // create recent lock file
      const lockPath = path.join(cacheDir, 'session-recent.json.lock');
      fs.writeFileSync(lockPath, '');

      sessionState.cleanupOldSessions();

      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('handles corrupted JSON during cleanup (graceful deletion)', () => {
      createCorruptedSession(tmpDir, 'corrupted-for-cleanup');

      // should not throw
      expect(() => sessionState.cleanupOldSessions()).not.toThrow();

      // corrupted file should be deleted
      const cacheDir = path.join(tmpDir, '.claude', 'cache');
      expect(fs.existsSync(path.join(cacheDir, 'session-corrupted-for-cleanup.json'))).toBe(false);
    });
  });

  describe('file persistence', () => {
    it('creates session file with valid JSON content', () => {
      sessionState.addModifiedFile('lock-test', 'file.ts');

      const cacheDir = path.join(tmpDir, '.claude', 'cache');
      const sessionPath = path.join(cacheDir, 'session-lock-test.json');

      expect(fs.existsSync(sessionPath)).toBe(true);

      // verify content is valid JSON with expected structure
      const content = fs.readFileSync(sessionPath, 'utf8');
      const parsed = JSON.parse(content) as { modifiedFiles?: string[] };
      expect(parsed).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.arrayContaining() returns AsymmetricMatcher typed as any
        modifiedFiles: expect.arrayContaining(['file.ts']),
      });
    });
  });
});
