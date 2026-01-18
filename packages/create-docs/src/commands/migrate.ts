/**
 * Migrate command - transforms existing docs to standard structure
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { loadConfig, getDocsPath } from '../config/manager.js';
import {
  detectAllFiles,
  shouldPromptForFile,
} from '../migrate/detector.js';
import {
  proposeStructureMigration,
  proposeFrontmatterMigration,
  executeStructureMigration,
  executeFrontmatterMigration,
  updateCrossReferences,
} from '../migrate/transformer.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
  updateBackupManifest,
  getBackup,
} from '../migrate/backup.js';
import type {
  MigrateCommandOptions,
  MigrationTier,
  MigrationPlan,
  ConflictResolution,
} from '../migrate/types.js';

export async function migrateCommand(options: MigrateCommandOptions): Promise<void> {
  const cwd = process.cwd();

  // handle restore
  if (options.restore !== undefined) {
    await handleRestore(cwd, options.restore);
    return;
  }

  // check for config
  const config = loadConfig(cwd);
  if (!config) {
    console.log(chalk.yellow('No .create-docs.json found.'));
    console.log('Run `create-docs init` first, or the migration will use default settings.');
    console.log();
  }

  console.log(chalk.blue('Scanning for existing documentation...'));
  const files = await detectAllFiles(cwd);

  if (files.length === 0) {
    console.log(chalk.yellow('No markdown files found to migrate.'));
    return;
  }

  console.log(`Found ${chalk.cyan(files.length)} markdown files.\n`);

  // determine which loose files to include
  const looseFiles = files.filter(shouldPromptForFile);
  let includedLooseFiles: string[] = [];

  if (looseFiles.length > 0 && !options.yes) {
    console.log(chalk.yellow(`Found ${looseFiles.length} files outside docs/ directory:`));

    for (const file of looseFiles) {
      const { include } = await inquirer.prompt<{ include: boolean }>([
        {
          type: 'confirm',
          name: 'include',
          message: `Include ${chalk.cyan(file.relativePath)} (detected as ${file.detectedType})?`,
          default: true,
        },
      ]);

      if (include) {
        includedLooseFiles.push(file.relativePath);
      }
    }
    console.log();
  } else if (options.yes) {
    // in non-interactive mode, include all loose files
    includedLooseFiles = looseFiles.map((f) => f.relativePath);
  }

  // select tier
  let tier: MigrationTier = options.tier ?? 'structure';

  if (!options.tier && !options.yes) {
    const { selectedTier } = await inquirer.prompt<{ selectedTier: MigrationTier }>([
      {
        type: 'list',
        name: 'selectedTier',
        message: 'Select migration tier:',
        choices: [
          {
            name: 'Structure only (move files to standard directories)',
            value: 'structure',
          },
          {
            name: 'Structure + Frontmatter (add/standardize metadata)',
            value: 'frontmatter',
          },
          {
            name: 'Full migration (structure + frontmatter + conventions)',
            value: 'conventions',
          },
        ],
        default: 'structure',
      },
    ]);
    tier = selectedTier;
  }

  // generate migration plan based on tier
  const plans: MigrationPlan[] = [];

  if (tier === 'structure' || tier === 'frontmatter' || tier === 'conventions') {
    const structurePlan = proposeStructureMigration(cwd, files, includedLooseFiles);
    plans.push(structurePlan);
  }

  if (tier === 'frontmatter' || tier === 'conventions') {
    const owner = config?.owner ?? '@owner';
    const frontmatterPlan = proposeFrontmatterMigration(cwd, files, owner);
    plans.push(frontmatterPlan);
  }

  // display plan
  displayMigrationPlan(plans);

  if (options.dryRun) {
    console.log(chalk.yellow('\n--dry-run mode: No changes were made.'));
    return;
  }

  // handle conflicts
  for (const plan of plans) {
    await resolveConflicts(plan);
  }

  // confirm execution
  if (!options.yes) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed with migration?',
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(chalk.yellow('Migration cancelled.'));
      return;
    }
  }

  // create backup unless disabled
  let backupName: string | null = null;

  if (!options.noBackup) {
    console.log(chalk.blue('\nCreating backup...'));
    const filesToBackup = files.map((f) => f.relativePath);
    backupName = createBackup(cwd, tier, filesToBackup);
    console.log(chalk.green(`Backup created: ${backupName}`));
  }

  // execute migration
  console.log(chalk.blue('\nExecuting migration...'));
  let fileMapping = new Map<string, string>();

  for (const plan of plans) {
    if (plan.tier === 'structure') {
      fileMapping = executeStructureMigration(cwd, plan);
      console.log(chalk.green(`  Moved ${fileMapping.size} files`));
    }

    if (plan.tier === 'frontmatter') {
      executeFrontmatterMigration(cwd, plan, fileMapping);
      console.log(chalk.green(`  Updated frontmatter in ${plan.items.length} files`));
    }
  }

  // update backup manifest with file mapping
  if (backupName && fileMapping.size > 0) {
    updateBackupManifest(cwd, backupName, fileMapping);
  }

  // update cross-references if structure changed
  if (fileMapping.size > 0) {
    console.log(chalk.blue('Updating cross-references...'));
    await updateAllCrossReferences(cwd, fileMapping);
  }

  console.log(chalk.green('\nMigration complete!'));

  if (backupName) {
    console.log(chalk.gray(`\nTo restore: create-docs migrate --restore ${backupName}`));
  }
}

/**
 * Display migration plan as a table
 */
function displayMigrationPlan(plans: MigrationPlan[]): void {
  for (const plan of plans) {
    if (plan.items.length === 0) {
      continue;
    }

    console.log(chalk.bold(`\n${plan.tier.toUpperCase()} Migration Plan:`));

    const table = new Table({
      head: [
        chalk.white('Current Location'),
        chalk.white('Proposed Location'),
        chalk.white('Action'),
      ],
      colWidths: [35, 35, 15],
    });

    for (const item of plan.items) {
      let actionDisplay: string = item.action;
      if (item.hasConflict) {
        actionDisplay = chalk.yellow(`${item.action} (conflict)`);
      }

      table.push([
        item.source.relativePath,
        item.targetPath,
        actionDisplay,
      ]);
    }

    console.log(table.toString());
    console.log(
      chalk.gray(
        `Total: ${plan.summary.totalFiles} files, ` +
        `${plan.summary.filesToMove} to move, ` +
        `${plan.summary.conflicts} conflicts`
      )
    );
  }
}

/**
 * Resolve conflicts interactively
 */
async function resolveConflicts(plan: MigrationPlan): Promise<void> {
  for (const item of plan.items) {
    if (!item.hasConflict) {
      continue;
    }

    const { resolution } = await inquirer.prompt<{ resolution: ConflictResolution }>([
      {
        type: 'list',
        name: 'resolution',
        message: `File already exists: ${chalk.cyan(item.targetPath)}\nWhat would you like to do?`,
        choices: [
          { name: 'Skip (keep existing)', value: 'skip' },
          { name: 'Rename incoming (add -migrated suffix)', value: 'rename' },
          { name: 'Overwrite (replace existing)', value: 'overwrite' },
        ],
        default: 'skip',
      },
    ]);

    item.conflictResolution = resolution;

    if (resolution === 'skip') {
      item.action = 'skip';
    }
  }
}

/**
 * Handle restore subcommand
 */
async function handleRestore(cwd: string, backupArg: string | boolean): Promise<void> {
  const backups = listBackups(cwd);

  if (backups.length === 0) {
    console.log(chalk.yellow('No backups found.'));
    return;
  }

  // if true (no specific backup), show list
  if (backupArg === true) {
    console.log(chalk.bold('Available backups:\n'));

    const table = new Table({
      head: [
        chalk.white('Name'),
        chalk.white('Date'),
        chalk.white('Tier'),
        chalk.white('Files'),
      ],
    });

    for (const backup of backups) {
      const date = new Date(backup.manifest.timestamp).toLocaleString();
      table.push([
        backup.name,
        date,
        backup.manifest.tier,
        backup.manifest.files.length.toString(),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray('\nTo restore: create-docs migrate --restore <name>'));
    return;
  }

  // restore specific backup
  const backupName = String(backupArg);
  const backup = getBackup(cwd, backupName);

  if (!backup) {
    console.log(chalk.red(`Backup not found: ${backupName}`));
    return;
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Restore backup from ${new Date(backup.manifest.timestamp).toLocaleString()}? This will undo migration changes.`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Restore cancelled.'));
    return;
  }

  console.log(chalk.blue('Restoring from backup...'));

  const result = restoreBackup(cwd, backupName);

  console.log(chalk.green(`\nRestored ${result.restored.length} files`));

  if (result.removed.length > 0) {
    console.log(chalk.gray(`Removed ${result.removed.length} migrated files`));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red('\nErrors:'));
    for (const error of result.errors) {
      console.log(chalk.red(`  ${error}`));
    }
  }
}

/**
 * Update cross-references in all files after structure migration
 */
async function updateAllCrossReferences(
  cwd: string,
  pathMapping: Map<string, string>
): Promise<void> {
  const docsPath = getDocsPath(cwd);

  if (!fs.existsSync(docsPath)) {
    return;
  }

  // create reverse mapping: newPath → oldPath
  // normalize paths to handle Windows/Unix separator differences
  const newToOldPath = new Map<string, string>();
  for (const [oldPath, newPath] of pathMapping) {
    newToOldPath.set(path.normalize(newPath), path.normalize(oldPath));
  }

  const files = await detectAllFiles(cwd);

  for (const file of files) {
    if (!file.insideDocs) {
      continue;
    }

    // determine the file's original path (before migration)
    // normalize path for cross-platform map lookup
    const normalizedPath = path.normalize(file.relativePath);
    const originalPath = newToOldPath.get(normalizedPath) ?? file.relativePath;

    const originalContent = file.content;
    const updatedContent = updateCrossReferences(
      originalContent,
      pathMapping,
      originalPath,        // original path for resolving old links
      file.relativePath    // new path for calculating new relative links
    );

    if (updatedContent !== originalContent) {
      fs.writeFileSync(file.absolutePath, updatedContent, 'utf-8');
    }
  }
}
