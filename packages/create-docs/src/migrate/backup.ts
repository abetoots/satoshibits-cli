/**
 * Backup and restore functionality for migration
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import type { BackupManifest, BackupInfo, BackupFileEntry, MigrationTier } from './types.js';
import { loadConfig } from '../config/manager.js';

const BACKUP_DIR = '.create-docs-backups';
const MANIFEST_FILE = 'manifest.json';

// read version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const CLI_VERSION: string = packageJson.version;

/**
 * Get the backup directory path
 */
export function getBackupDir(cwd: string): string {
  return path.join(cwd, BACKUP_DIR);
}

/**
 * Generate a timestamp-based backup name
 */
export function generateBackupName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Create a backup of existing docs before migration
 */
export async function createBackup(
  cwd: string,
  tier: MigrationTier,
  filesToBackup: string[]
): Promise<string> {
  const backupName = generateBackupName();
  const backupPath = path.join(getBackupDir(cwd), backupName);

  // create backup directory
  fs.mkdirSync(backupPath, { recursive: true });

  const entries: BackupFileEntry[] = [];

  for (const relativePath of filesToBackup) {
    const sourcePath = path.join(cwd, relativePath);

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    // determine backup subdirectory
    const isInsideDocs = relativePath.startsWith('docs/') || relativePath.startsWith('docs\\');
    const backupSubdir = isInsideDocs ? 'docs' : 'loose-files';
    const backupFilePath = isInsideDocs
      ? relativePath
      : path.join('loose-files', relativePath);

    const targetPath = path.join(backupPath, backupFilePath);
    const targetDir = path.dirname(targetPath);

    // ensure directory exists
    fs.mkdirSync(targetDir, { recursive: true });

    // copy file
    fs.copyFileSync(sourcePath, targetPath);

    entries.push({
      from: relativePath,
      to: null, // will be updated by migration
      backupPath: backupFilePath,
    });
  }

  // load current config if exists
  const config = loadConfig(cwd);

  // create manifest
  const manifest: BackupManifest = {
    timestamp: new Date().toISOString(),
    tier,
    files: entries,
    config: config as Record<string, unknown> | null,
    version: CLI_VERSION,
  };

  fs.writeFileSync(
    path.join(backupPath, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  return backupName;
}

/**
 * Update backup manifest with migration targets
 */
export function updateBackupManifest(
  cwd: string,
  backupName: string,
  fileMapping: Map<string, string>
): void {
  const manifestPath = path.join(getBackupDir(cwd), backupName, MANIFEST_FILE);

  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  for (const entry of manifest.files) {
    const target = fileMapping.get(entry.from);
    if (target) {
      entry.to = target;
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * List all available backups
 */
export async function listBackups(cwd: string): Promise<BackupInfo[]> {
  const backupDir = getBackupDir(cwd);

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const backups: BackupInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(backupDir, entry.name, MANIFEST_FILE);

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest: BackupManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8')
      );

      backups.push({
        name: entry.name,
        path: path.join(backupDir, entry.name),
        manifest,
      });
    } catch {
      // skip invalid manifests
      continue;
    }
  }

  // sort by timestamp descending (newest first)
  backups.sort((a, b) =>
    new Date(b.manifest.timestamp).getTime() - new Date(a.manifest.timestamp).getTime()
  );

  return backups;
}

/**
 * Get a specific backup by name
 */
export async function getBackup(cwd: string, backupName: string): Promise<BackupInfo | null> {
  const backupPath = path.join(getBackupDir(cwd), backupName);
  const manifestPath = path.join(backupPath, MANIFEST_FILE);

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest: BackupManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf-8')
    );

    return {
      name: backupName,
      path: backupPath,
      manifest,
    };
  } catch {
    return null;
  }
}

/**
 * Restore files from a backup
 */
export async function restoreBackup(cwd: string, backupName: string): Promise<{
  restored: string[];
  removed: string[];
  errors: string[];
}> {
  const backup = await getBackup(cwd, backupName);

  if (!backup) {
    throw new Error(`Backup not found: ${backupName}`);
  }

  const restored: string[] = [];
  const removed: string[] = [];
  const errors: string[] = [];

  for (const entry of backup.manifest.files) {
    const backupFilePath = path.join(backup.path, entry.backupPath);
    const targetPath = path.join(cwd, entry.from);

    try {
      // if file was moved, remove the migrated version
      if (entry.to && entry.to !== entry.from) {
        const migratedPath = path.join(cwd, entry.to);
        if (fs.existsSync(migratedPath)) {
          fs.unlinkSync(migratedPath);
          removed.push(entry.to);
        }
      }

      // restore original file
      if (fs.existsSync(backupFilePath)) {
        const targetDir = path.dirname(targetPath);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(backupFilePath, targetPath);
        restored.push(entry.from);
      }
    } catch (err) {
      errors.push(`Failed to restore ${entry.from}: ${err}`);
    }
  }

  return { restored, removed, errors };
}

/**
 * Delete a backup
 */
export async function deleteBackup(cwd: string, backupName: string): Promise<void> {
  const backupPath = path.join(getBackupDir(cwd), backupName);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupName}`);
  }

  fs.rmSync(backupPath, { recursive: true, force: true });
}

/**
 * Check if backups exist
 */
export function hasBackups(cwd: string): boolean {
  const backupDir = getBackupDir(cwd);

  if (!fs.existsSync(backupDir)) {
    return false;
  }

  const entries = fs.readdirSync(backupDir);
  return entries.length > 0;
}
