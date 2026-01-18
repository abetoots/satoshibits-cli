/**
 * File writer with overwrite protection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

export type WriteAction = 'created' | 'updated' | 'skipped' | 'backed-up';

export interface WriteResult {
  action: WriteAction;
  filePath: string;
  backupPath?: string;
}

export interface WriteOptions {
  force?: boolean;
  backup?: boolean;
  silent?: boolean;
}

/**
 * ensures the directory exists for a file path
 */
export function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * creates a backup of a file
 */
export function createBackup(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  const backupPath = path.join(dir, `${base}.backup-${timestamp}${ext}`);

  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * writes a file with overwrite protection
 * returns the action taken
 */
export async function writeFileWithProtection(
  filePath: string,
  content: string,
  options: WriteOptions = {}
): Promise<WriteResult> {
  const { force = false, backup = true, silent = false } = options;

  ensureDir(filePath);

  const exists = fs.existsSync(filePath);

  if (!exists) {
    fs.writeFileSync(filePath, content, 'utf-8');
    if (!silent) {
      console.log(chalk.gray(`  Created: ${path.relative(process.cwd(), filePath)}`));
    }
    return { action: 'created', filePath };
  }

  // file exists - check if content is the same
  const existingContent = fs.readFileSync(filePath, 'utf-8');
  if (existingContent === content) {
    if (!silent) {
      console.log(chalk.gray(`  Unchanged: ${path.relative(process.cwd(), filePath)}`));
    }
    return { action: 'skipped', filePath };
  }

  // file exists and content differs
  if (force) {
    if (backup) {
      const backupPath = createBackup(filePath);
      fs.writeFileSync(filePath, content, 'utf-8');
      if (!silent) {
        console.log(chalk.gray(`  Updated: ${path.relative(process.cwd(), filePath)} (backup: ${path.basename(backupPath)})`));
      }
      return { action: 'backed-up', filePath, backupPath };
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
      if (!silent) {
        console.log(chalk.gray(`  Updated: ${path.relative(process.cwd(), filePath)}`));
      }
      return { action: 'updated', filePath };
    }
  }

  // prompt for overwrite
  const relativePath = path.relative(process.cwd(), filePath);
  const shouldOverwrite = await confirm({
    message: `${relativePath} already exists. Overwrite?`,
    default: false,
  });

  if (shouldOverwrite) {
    if (backup) {
      const backupPath = createBackup(filePath);
      fs.writeFileSync(filePath, content, 'utf-8');
      if (!silent) {
        console.log(chalk.gray(`  Updated: ${relativePath} (backup: ${path.basename(backupPath)})`));
      }
      return { action: 'backed-up', filePath, backupPath };
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
      if (!silent) {
        console.log(chalk.gray(`  Updated: ${relativePath}`));
      }
      return { action: 'updated', filePath };
    }
  }

  if (!silent) {
    console.log(chalk.gray(`  Skipped: ${relativePath}`));
  }
  return { action: 'skipped', filePath };
}

/**
 * writes multiple files with summary
 */
export async function writeFiles(
  files: { path: string; content: string }[],
  options: WriteOptions = {}
): Promise<WriteResult[]> {
  const results: WriteResult[] = [];

  for (const file of files) {
    const result = await writeFileWithProtection(file.path, file.content, options);
    results.push(result);
  }

  return results;
}

/**
 * prints a summary of write results
 */
export function printWriteSummary(results: WriteResult[]): void {
  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated' || r.action === 'backed-up').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;

  const parts: string[] = [];
  if (created > 0) parts.push(`${created} created`);
  if (updated > 0) parts.push(`${updated} updated`);
  if (skipped > 0) parts.push(`${skipped} skipped`);

  if (parts.length > 0) {
    console.log(chalk.gray(`\n  Summary: ${parts.join(', ')}`));
  }
}
