/**
 * Tests for debug-logger module
 *
 * Tests logger creation, file writing, rotation, categories
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger, createNoopLogger } from '../debug-logger.mjs';
import { createTempDir, cleanupTempDir } from './helpers.js';

describe('debug-logger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    // ensure cache directory exists
    fs.mkdirSync(path.join(tmpDir, '.claude', 'cache'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  describe('createLogger()', () => {
    it('creates active logger when enabled=true', () => {
      const logger = createLogger(tmpDir, true);

      logger.log('activation', 'test message', { data: 123 });

      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('test message');
      expect(content).toContain('activation');
    });

    it('returns no-op logger when enabled=false', () => {
      const logger = createLogger(tmpDir, false);

      logger.log('activation', 'should not appear');

      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      expect(fs.existsSync(logPath)).toBe(false);
    });
  });

  describe('createNoopLogger()', () => {
    it('returns silent logger that does nothing', () => {
      const logger = createNoopLogger();

      // noop logger should implement the same interface without throwing
      expect(() => logger.log('error', 'test', { data: 1 })).not.toThrow();
      expect(() => logger.log('activation', 'another')).not.toThrow();
      expect(() => logger.log('scoring', 'message', { score: 10 })).not.toThrow();
    });
  });

  describe('log()', () => {
    it('writes JSON log entries to file', () => {
      const logger = createLogger(tmpDir, true);

      logger.log('scoring', 'skill matched', { skill: 'test-skill', score: 30 });

      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      const content = fs.readFileSync(logPath, 'utf8');

      // verify it's valid JSON with expected structure
      interface LogEntry {
        cat: string;
        msg: string;
        skill: string;
        score: number;
        t: string;
        pid: number;
      }
      const entry = JSON.parse(content.trim()) as LogEntry;
      expect(entry.cat).toBe('scoring');
      expect(entry.msg).toBe('skill matched');
      expect(entry.skill).toBe('test-skill');
      expect(entry.score).toBe(30);
      // validate timestamp is a valid ISO string
      expect(typeof entry.t).toBe('string');
      expect(new Date(entry.t).toISOString()).toBe(entry.t);
      // validate pid is a positive number
      expect(typeof entry.pid).toBe('number');
      expect(entry.pid).toBeGreaterThan(0);
    });

    it('filters by categories when specified', () => {
      const logger = createLogger(tmpDir, true, ['activation', 'error']);

      logger.log('scoring', 'should not appear');
      logger.log('activation', 'should appear');

      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).not.toContain('should not appear');
      expect(content).toContain('should appear');
    });

    it('logs all categories when none specified', () => {
      const logger = createLogger(tmpDir, true);

      logger.log('activation', 'activation log');
      logger.log('scoring', 'scoring log');
      logger.log('validation', 'validation log');
      logger.log('error', 'error log');

      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('activation log');
      expect(content).toContain('scoring log');
      expect(content).toContain('validation log');
      expect(content).toContain('error log');
    });
  });

  describe('log rotation', () => {
    it('rotates log file when size exceeds 1MB', () => {
      const logger = createLogger(tmpDir, true);
      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      const backupPath = logPath + '.1';

      // create a file just under 1MB
      const largeContent = 'x'.repeat(1024 * 1024 + 100); // slightly over 1MB
      fs.writeFileSync(logPath, largeContent);

      // trigger rotation by writing another log
      logger.log('activation', 'trigger rotation');

      // original file should be rotated to .1
      expect(fs.existsSync(backupPath)).toBe(true);

      // new file should have the new log entry
      const newContent = fs.readFileSync(logPath, 'utf8');
      expect(newContent).toContain('trigger rotation');
    });

    it('overwrites existing backup file on rotation', () => {
      const logger = createLogger(tmpDir, true);
      const logPath = path.join(tmpDir, '.claude', 'cache', 'debug.log');
      const backupPath = logPath + '.1';

      // create existing backup
      fs.writeFileSync(backupPath, 'old backup content');

      // create large file to trigger rotation
      const largeContent = 'x'.repeat(1024 * 1024 + 100);
      fs.writeFileSync(logPath, largeContent);

      // trigger rotation
      logger.log('activation', 'new content');

      // backup should be overwritten with the large content
      const backupContent = fs.readFileSync(backupPath, 'utf8');
      expect(backupContent).not.toContain('old backup content');
    });
  });
});
