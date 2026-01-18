#!/usr/bin/env node

/**
 * create-docs CLI
 *
 * a cli for generating standardized document templates (BRD, FRD, ADD, TSD)
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { newCommand } from './commands/new.js';
import { lintCommand } from './commands/lint.js';
import { statusCommand } from './commands/status.js';
import { migrateCommand } from './commands/migrate.js';
import type { ProjectProfile } from './types.js';
import type { MigrationTier } from './migrate/types.js';

interface InitOptions {
  profile?: ProjectProfile;
  yes?: boolean;
  force?: boolean;
}

interface MigrateOptions {
  dryRun?: boolean;
  tier?: MigrationTier;
  noBackup?: boolean;
  restore?: string | boolean;
  yes?: boolean;
}

const program = new Command();

program
  .name('create-docs')
  .description('CLI for generating standardized document templates')
  .version('1.0.0');

// init command
program
  .command('init')
  .description('Initialize documentation structure and create .create-docs.json')
  .option('-p, --profile <profile>', 'Project profile (greenfield, migration, library)')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('-f, --force', 'Overwrite existing docs/ directory')
  .action(async (options: InitOptions) => {
    await initCommand({
      profile: options.profile,
      yes: options.yes,
      force: options.force,
    });
  });

// new command
program
  .command('new <type> [name]')
  .description('Generate a new document from template')
  .addHelpText('after', `
Document types:
  adr        Architecture Decision Record (auto-numbered)
  spec       Technical specification (in 04-specs/)
  guideline  Engineering guideline (in 05-guidelines/)
  basic      Generic document template

Examples:
  create-docs new adr "Use PostgreSQL for relational data"
  create-docs new spec api
  create-docs new guideline code-review-process
  `)
  .action(async (type: 'adr' | 'spec' | 'guideline' | 'basic', name?: string) => {
    await newCommand({ type, name });
  });

// lint command
program
  .command('lint')
  .description('Validate documentation integrity')
  .addHelpText('after', `
Checks performed:
  - YAML frontmatter schema validation
  - Required fields (title, status, version, owner, last_updated)
  - Valid status values (Draft, Review, Approved, Deprecated)
  - Broken internal links
  - Orphan requirement ID references
  - Stale documents (>6 months without update)
  `)
  .action(async () => {
    await lintCommand();
  });

// status command
program
  .command('status')
  .description('Display document health table')
  .addHelpText('after', `
Shows:
  - Document status (Draft, Review, Approved, Deprecated)
  - Owner assignment
  - Last updated date
  - Version numbers
  - Coverage metrics
  `)
  .action(async () => {
    await statusCommand();
  });

// migrate command
program
  .command('migrate')
  .description('Migrate existing documentation to standard structure')
  .option('--dry-run', 'Show what would change without making modifications')
  .option('-t, --tier <tier>', 'Migration tier (structure, frontmatter, conventions)')
  .option('--no-backup', 'Skip creating backup before migration')
  .option('-r, --restore [name]', 'Restore from backup (list backups if no name given)')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .addHelpText('after', `
Migration tiers:
  structure    Move files to standard directory layout (Tier 1)
  frontmatter  Add/standardize YAML frontmatter (Tier 2)
  conventions  Standardize IDs, links, traceability (Tier 3)

Examples:
  create-docs migrate --dry-run           # Preview changes
  create-docs migrate --tier structure    # Move files only
  create-docs migrate                     # Interactive full migration
  create-docs migrate --restore           # List available backups
  create-docs migrate --restore <name>    # Restore from backup
  `)
  .action(async (options: MigrateOptions) => {
    await migrateCommand({
      dryRun: options.dryRun,
      tier: options.tier,
      noBackup: options.noBackup === false ? true : false,
      restore: options.restore,
      yes: options.yes,
    });
  });

program.parse();
