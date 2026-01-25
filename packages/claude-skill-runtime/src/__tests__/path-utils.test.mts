/**
 * Tests for path-utils module
 *
 * Tests path normalization and resolution utilities
 */

import path from 'path';
import { describe, it, expect } from 'vitest';
import { normalizeFilePath, normalizeFilePaths, resolveFilePath } from '../path-utils.mjs';

describe('path-utils', () => {
  const projectDir = '/home/user/project';

  describe('normalizeFilePath()', () => {
    it('returns relative paths unchanged', () => {
      const relativePath = 'src/components/Button.tsx';
      const result = normalizeFilePath(relativePath, projectDir);
      expect(result).toBe(relativePath);
    });

    it('converts absolute path within project to relative', () => {
      const absolutePath = '/home/user/project/src/utils/index.ts';
      const result = normalizeFilePath(absolutePath, projectDir);
      expect(result).toBe('src/utils/index.ts');
    });

    it('preserves absolute path when outside project directory', () => {
      const outsidePath = '/etc/config.json';
      const result = normalizeFilePath(outsidePath, projectDir);
      expect(result).toBe(outsidePath);
    });

    it('handles path that is sibling to project (starts with ..)', () => {
      const siblingPath = '/home/user/other-project/file.ts';
      const result = normalizeFilePath(siblingPath, projectDir);
      // should return absolute since it's outside project
      expect(result).toBe(siblingPath);
    });

    it('handles nested paths correctly', () => {
      const nestedPath = '/home/user/project/src/deeply/nested/file.ts';
      const result = normalizeFilePath(nestedPath, projectDir);
      expect(result).toBe('src/deeply/nested/file.ts');
    });
  });

  describe('normalizeFilePaths()', () => {
    it('normalizes array of file paths', () => {
      const paths = [
        '/home/user/project/src/a.ts',
        '/home/user/project/src/b.ts',
        'already/relative.ts',
      ];
      const result = normalizeFilePaths(paths, projectDir);
      expect(result).toEqual(['src/a.ts', 'src/b.ts', 'already/relative.ts']);
    });

    it('handles empty array', () => {
      const result = normalizeFilePaths([], projectDir);
      expect(result).toEqual([]);
    });

    it('handles mixed absolute and relative paths', () => {
      const paths = [
        '/home/user/project/file1.ts',
        'relative/file2.ts',
        '/outside/file3.ts',
      ];
      const result = normalizeFilePaths(paths, projectDir);
      expect(result).toEqual(['file1.ts', 'relative/file2.ts', '/outside/file3.ts']);
    });
  });

  describe('resolveFilePath()', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = '/home/user/project/src/file.ts';
      const result = resolveFilePath(absolutePath, projectDir);
      expect(result).toBe(absolutePath);
    });

    it('resolves relative path to absolute using project root', () => {
      const relativePath = 'src/components/Button.tsx';
      const result = resolveFilePath(relativePath, projectDir);
      expect(result).toBe(path.join(projectDir, relativePath));
    });

    it('handles nested relative paths', () => {
      const relativePath = 'src/deeply/nested/file.ts';
      const result = resolveFilePath(relativePath, projectDir);
      expect(result).toBe('/home/user/project/src/deeply/nested/file.ts');
    });

    it('handles file at project root', () => {
      const relativePath = 'package.json';
      const result = resolveFilePath(relativePath, projectDir);
      expect(result).toBe('/home/user/project/package.json');
    });
  });

  describe('edge cases', () => {
    it('handles empty string path', () => {
      // empty string is passed through unchanged - this is expected behavior
      // as empty paths should not trigger any normalization logic
      const result = normalizeFilePath('', projectDir);
      expect(result).toBe('');
    });

    it('handles path with trailing slash (normalized by path.relative)', () => {
      // path.relative normalizes trailing slashes
      const pathWithSlash = '/home/user/project/src/';
      const result = normalizeFilePath(pathWithSlash, projectDir);
      expect(result).toBe('src');
    });

    it('resolves empty string to project directory', () => {
      const result = resolveFilePath('', projectDir);
      expect(result).toBe(projectDir);
    });
  });
});
