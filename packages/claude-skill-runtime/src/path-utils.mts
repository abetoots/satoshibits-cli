/**
 * Path normalization utilities
 * Converts absolute paths to relative for consistent pattern matching
 */

import path from 'path';

/**
 * Normalize file path to be relative to project directory
 * Handles both absolute and already-relative paths
 */
export function normalizeFilePath(filePath: string, projectDir: string): string {
  // if already relative, return as-is
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  // convert absolute to relative
  const relativePath = path.relative(projectDir, filePath);

  // if path is outside project (starts with ..), return absolute
  // this handles edge cases like system files
  if (relativePath.startsWith('..')) {
    return filePath;
  }

  return relativePath;
}

/**
 * Normalize array of file paths
 */
export function normalizeFilePaths(filePaths: string[], projectDir: string): string[] {
  return filePaths.map(fp => normalizeFilePath(fp, projectDir));
}

/**
 * Resolve relative path to absolute for file system operations
 */
export function resolveFilePath(filePath: string, projectDir: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(projectDir, filePath);
}
