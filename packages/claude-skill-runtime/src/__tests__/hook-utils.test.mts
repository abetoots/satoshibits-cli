/**
 * Tests for hook-utils module
 *
 * Tests readStdin, initHookContext, handleHookError
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStdin, initHookContext, handleHookError } from '../hook-utils.mjs';
import { createTempDir, cleanupTempDir, createSkillRulesYaml } from './helpers.js';

describe('hook-utils', () => {
  let tmpDir: string;
  let originalDebug: string | undefined;
  let originalClaudeProjectDir: string | undefined;

  beforeEach(() => {
    tmpDir = createTempDir();
    // save original env values for restoration
    originalDebug = process.env.DEBUG;
    originalClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.DEBUG;
    delete process.env.CLAUDE_PROJECT_DIR;
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
    vi.restoreAllMocks();
    // restore original env values
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
    if (originalClaudeProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = originalClaudeProjectDir;
    } else {
      delete process.env.CLAUDE_PROJECT_DIR;
    }
  });

  describe('readStdin()', () => {
    it('resolves with data from stdin', async () => {
      const testData = '{"test": "data"}';
      const mockStream = Readable.from([testData]);
      // @ts-expect-error mocking read-only property with partial stream implementation
      vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStream);

      const result = await readStdin();

      expect(result).toBe(testData);
    });

    it('resolves with chunked data correctly', async () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3'];
      const mockStream = Readable.from(chunks);
      // @ts-expect-error mocking read-only property with partial stream implementation
      vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStream);

      const result = await readStdin();

      expect(result).toBe('chunk1chunk2chunk3');
    });

    it('rejects on error event', async () => {
      const mockStream = new Readable({
        read() {
          this.destroy(new Error('Test stdin error'));
        },
      });
      // @ts-expect-error mocking read-only property with partial stream implementation
      vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStream);

      await expect(readStdin()).rejects.toThrow('Test stdin error');
    });
  });

  describe('initHookContext()', () => {
    it('returns complete context with all fields', () => {
      createSkillRulesYaml(tmpDir, {
        version: '1.0',
        description: 'Test',
        skills: {},
      });

      const context = initHookContext({
        workingDirectory: tmpDir,
      });

      expect(context.projectDir).toBe(tmpDir);
      expect(context.configLoader).toBeDefined();
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
    });

    it('uses CLAUDE_PROJECT_DIR env when set', () => {
      const envProjectDir = createTempDir('env-project-');
      try {
        createSkillRulesYaml(envProjectDir, { skills: {} });
        process.env.CLAUDE_PROJECT_DIR = envProjectDir;

        const context = initHookContext({
          workingDirectory: tmpDir,
        });

        expect(context.projectDir).toBe(envProjectDir);
      } finally {
        delete process.env.CLAUDE_PROJECT_DIR;
        cleanupTempDir(envProjectDir);
      }
    });

    it('prioritizes CLAUDE_PROJECT_DIR over workingDirectory', () => {
      const envProjectDir = createTempDir('env-project-');
      try {
        createSkillRulesYaml(envProjectDir, { skills: {} });
        createSkillRulesYaml(tmpDir, { skills: {} });
        process.env.CLAUDE_PROJECT_DIR = envProjectDir;

        const context = initHookContext({
          workingDirectory: tmpDir,
        });

        expect(context.projectDir).toBe(envProjectDir);
        expect(context.projectDir).not.toBe(tmpDir);
      } finally {
        delete process.env.CLAUDE_PROJECT_DIR;
        cleanupTempDir(envProjectDir);
      }
    });

    it('skips session state init when initSessionState: false', () => {
      createSkillRulesYaml(tmpDir, { skills: {} });

      // should not throw even without cache directory
      const context = initHookContext({
        workingDirectory: tmpDir,
        initSessionState: false,
      });

      expect(context.projectDir).toBe(tmpDir);
    });

    it('initializes session state by default', () => {
      createSkillRulesYaml(tmpDir, { skills: {} });

      initHookContext({
        workingDirectory: tmpDir,
      });

      // cache directory should be created
      const cacheDir = path.join(tmpDir, '.claude', 'cache');
      expect(fs.existsSync(cacheDir)).toBe(true);
    });
  });

  describe('handleHookError()', () => {
    it('logs Error instances with message and stack', () => {
      const mockLogger = {
        log: vi.fn(),
      };

      const error = new Error('Test error message');

      handleHookError(error, mockLogger, {
        hookName: 'PreToolUse',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        'error',
        'PreToolUse hook failed',
        expect.objectContaining({
          error: 'Test error message',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns AsymmetricMatcher typed as any
          stack: expect.any(String),
        })
      );
    });

    it('logs non-Error throws as strings', () => {
      const mockLogger = {
        log: vi.fn(),
      };

      handleHookError('string error', mockLogger, {
        hookName: 'PostToolUse',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        'error',
        'PostToolUse hook failed',
        expect.objectContaining({
          error: 'string error',
        })
      );
    });

    it('logs object throws as strings', () => {
      const mockLogger = {
        log: vi.fn(),
      };

      handleHookError({ code: 'ERR' } as unknown, mockLogger, {
        hookName: 'Stop',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        'error',
        'Stop hook failed',
        expect.objectContaining({
          error: '[object Object]',
        })
      );
    });

    it('outputs to stderr with DEBUG env set when debugOutput: true', () => {
      const mockLogger = { log: vi.fn() };
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation((): void => { /* no-op for test */ });
      process.env.DEBUG = '1';

      handleHookError(new Error('debug error'), mockLogger, {
        hookName: 'Test',
        debugOutput: true,
      });

      expect(stderrSpy).toHaveBeenCalledWith(
        'Test hook error:',
        expect.any(Error)
      );
    });

    it('does not output to stderr when debugOutput: true but DEBUG unset', () => {
      const mockLogger = { log: vi.fn() };
      const stderrSpy = vi.spyOn(console, 'error').mockImplementation((): void => { /* no-op for test */ });
      delete process.env.DEBUG;

      handleHookError(new Error('no debug'), mockLogger, {
        hookName: 'Test',
        debugOutput: true,
      });

      // logger should be called, but not stderr
      expect(mockLogger.log).toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('handles null logger gracefully', () => {
      expect(() =>
        handleHookError(new Error('test'), null, {
          hookName: 'Test',
        })
      ).not.toThrow();
    });
  });
});
