#!/usr/bin/env node

/**
 * create-github-workflows CLI
 *
 * A CLI for generating standardized GitHub workflow templates
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import type { InitOptions, AddOptions } from './types.js';

const program = new Command();

program
  .name('create-github-workflows')
  .description('CLI for generating standardized GitHub workflow templates')
  .version('0.0.0');

// init command
program
  .command('init')
  .description('Initialize GitHub workflows with interactive setup')
  .option('-p, --preset <preset>', 'Workflow preset (library, docker-app, monorepo)')
  .option('-y, --yes', 'Skip prompts and use defaults (requires --preset)')
  .option('-f, --force', 'Overwrite existing workflows')
  .addHelpText('after', `
Presets:
  library     NPM package with release-please, npm publishing
  docker-app  Docker application with build, deploy workflows
  monorepo    Multi-package workspace with changesets

Examples:
  create-github-workflows init
  create-github-workflows init --preset library
  create-github-workflows init --preset docker-app --yes
  create-github-workflows init --force
  `)
  .action(async (options: InitOptions) => {
    // validate preset if provided
    if (options.preset && !['library', 'docker-app', 'monorepo'].includes(options.preset)) {
      console.error(`Invalid preset: ${options.preset}`);
      console.error('Valid presets: library, docker-app, monorepo');
      process.exit(1);
    }

    // --yes requires --preset
    if (options.yes && !options.preset) {
      console.error('--yes requires --preset to be specified');
      process.exit(1);
    }

    await initCommand({
      preset: options.preset,
      yes: options.yes,
      force: options.force,
    });
  });

// add command
program
  .command('add <workflow>')
  .description('Add an individual workflow')
  .option('-f, --force', 'Overwrite existing workflow')
  .addHelpText('after', `
Workflows:
  CI:
    pr-validation  Fast PR feedback (lint, typecheck, test)
    build          Main branch protection with Docker build

  Release:
    release-please  Automated version/changelog management
    changesets      Monorepo release management

  Publish:
    npm            NPM package publishing
    docker         Docker image promotion

  Deploy:
    staging        Manual staging deployment
    preview        Manual preview deployment
    production     Tag-triggered production deployment

Examples:
  create-github-workflows add pr-validation
  create-github-workflows add release-please --force
  create-github-workflows add docker
  `)
  .action(async (workflow: string, options: AddOptions) => {
    await addCommand(workflow, options);
  });

// list command
program
  .command('list')
  .description('List available and installed workflows')
  .action(() => {
    listCommand();
  });

program.parse();
