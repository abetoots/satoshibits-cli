/**
 * CLI command option types
 *
 * These interfaces mirror Commander.js options for type-safe command handlers.
 */

export interface InitOptions {
  type?: string;
  yes?: boolean;
}

export interface AddSkillOptions {
  description?: string;
  keywords?: string;
  interactive?: boolean;
  force?: boolean;
  template?: boolean;
  var?: string[];
}

export interface WizardOptions {
  skipClassification?: boolean;
  forceAutoLoad?: boolean;
  forceManual?: boolean;
}

export interface ValidateOptions {
  fix?: boolean;
  verbose?: boolean;
}

export interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export interface UpgradeOptions {
  backup?: boolean;
}

/**
 * Extended SkillConfig with sync metadata
 *
 * Used by sync command to track which skills were auto-synced vs manually added.
 */
export interface SyncMetadata {
  lastSync: string;
  checksum: string;
  syncedSkills: string[];
  manualSkills: string[];
}
