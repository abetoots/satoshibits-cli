/**
 * Migration-specific types for the migrate command
 */

export type MigrationTier = 'structure' | 'frontmatter' | 'conventions';

export type DocumentType =
  | 'brd'
  | 'frd'
  | 'add'
  | 'tsd'
  | 'adr'
  | 'spec'
  | 'guideline'
  | 'runbook'
  | 'security'
  | 'readme'
  | 'glossary'
  | 'unknown';

export type MigrationAction = 'move' | 'skip' | 'rename' | 'overwrite' | 'add-frontmatter' | 'update-frontmatter' | 'transform-ids';

export type ConflictResolution = 'skip' | 'rename' | 'overwrite';

export interface DetectedFile {
  /** Relative path from cwd */
  relativePath: string;
  /** Absolute path */
  absolutePath: string;
  /** Whether file is inside docs/ directory */
  insideDocs: boolean;
  /** Detected document type based on heuristics */
  detectedType: DocumentType;
  /** Confidence score 0-1 */
  confidence: number;
  /** Existing frontmatter if any */
  frontmatter: Record<string, unknown> | null;
  /** Raw file content */
  content: string;
}

export interface MigrationItem {
  /** Source file info */
  source: DetectedFile;
  /** Proposed target path (relative to cwd) */
  targetPath: string;
  /** Action to take */
  action: MigrationAction;
  /** Whether target already exists */
  hasConflict: boolean;
  /** User's resolution choice if conflict */
  conflictResolution?: ConflictResolution;
  /** Frontmatter changes (for tier 2) */
  frontmatterChanges?: FrontmatterChange[];
  /** ID transformations (for tier 3) */
  idTransformations?: IdTransformation[];
}

export interface FrontmatterChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  action: 'add' | 'update' | 'remove';
}

export interface IdTransformation {
  oldId: string;
  newId: string;
  occurrences: number;
}

export interface MigrationPlan {
  /** Timestamp of plan creation */
  timestamp: string;
  /** Migration tier being applied */
  tier: MigrationTier;
  /** Items to migrate */
  items: MigrationItem[];
  /** Summary stats */
  summary: {
    totalFiles: number;
    filesToMove: number;
    filesToSkip: number;
    conflicts: number;
    frontmatterChanges: number;
    idTransformations: number;
  };
}

export interface BackupManifest {
  /** ISO timestamp of backup */
  timestamp: string;
  /** Migration tier that triggered backup */
  tier: MigrationTier;
  /** Files that were backed up */
  files: BackupFileEntry[];
  /** Config at time of backup */
  config: Record<string, unknown> | null;
  /** Version of create-docs that created backup */
  version: string;
}

export interface BackupFileEntry {
  /** Original path relative to cwd */
  from: string;
  /** Target path after migration (if applicable) */
  to: string | null;
  /** Path in backup directory */
  backupPath: string;
}

export interface BackupInfo {
  /** Backup directory name (timestamp) */
  name: string;
  /** Full path to backup */
  path: string;
  /** Parsed manifest */
  manifest: BackupManifest;
}

export interface MigrateCommandOptions {
  dryRun?: boolean;
  tier?: MigrationTier;
  noBackup?: boolean;
  restore?: string | boolean;
  yes?: boolean;
}
