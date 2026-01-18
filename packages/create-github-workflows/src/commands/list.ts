/**
 * list command - shows available and installed workflows
 */

import chalk from 'chalk';
import { configExists, loadConfig, getInstalledWorkflows } from '../config/manager.js';
import { WORKFLOW_REGISTRY, type WorkflowName } from '../types.js';

/**
 * runs the list command
 */
export function listCommand(): void {
  const cwd = process.cwd();

  // get installed workflows from filesystem
  const installedFiles = getInstalledWorkflows(cwd);

  // get configured workflows from config
  const config = configExists(cwd) ? loadConfig(cwd) : null;
  const configuredWorkflows = config?.workflows ?? [];

  console.log(chalk.blue('\n📋 Workflow Status\n'));

  // map output files to workflow names
  const fileToWorkflow = new Map<string, WorkflowName>();
  for (const [name, info] of Object.entries(WORKFLOW_REGISTRY)) {
    fileToWorkflow.set(info.outputFile, name as WorkflowName);
  }

  const categories = {
    ci: { title: 'CI', workflows: ['pr-validation', 'build'] as WorkflowName[] },
    release: { title: 'Release', workflows: ['release-please', 'changesets'] as WorkflowName[] },
    publish: { title: 'Publish', workflows: ['npm', 'docker'] as WorkflowName[] },
    deploy: { title: 'Deploy', workflows: ['staging', 'preview', 'production'] as WorkflowName[] },
  };

  for (const [, { title, workflows }] of Object.entries(categories)) {
    console.log(chalk.gray(`  ${title}`));

    for (const workflowName of workflows) {
      const info = WORKFLOW_REGISTRY[workflowName];
      const isInstalled = installedFiles.includes(info.outputFile);
      const isConfigured = configuredWorkflows.includes(workflowName);

      let status: string;
      let statusColor: (text: string) => string;

      if (isInstalled && isConfigured) {
        status = '✓';
        statusColor = chalk.green;
      } else if (isInstalled && !isConfigured) {
        status = '?';
        statusColor = chalk.yellow;
      } else if (!isInstalled && isConfigured) {
        status = '!';
        statusColor = chalk.red;
      } else {
        status = '○';
        statusColor = chalk.gray;
      }

      console.log(
        `    ${statusColor(status)} ${chalk.white(workflowName.padEnd(16))} ${chalk.gray(info.description)}`
      );
    }

    console.log('');
  }

  // legend
  console.log(chalk.gray('  Legend:'));
  console.log(chalk.green('    ✓') + chalk.gray(' Installed and configured'));
  console.log(chalk.yellow('    ?') + chalk.gray(' Installed but not in config'));
  console.log(chalk.red('    !') + chalk.gray(' In config but missing file'));
  console.log(chalk.gray('    ○ Not installed'));

  // show unrecognized workflows
  const recognizedFiles = new Set(Object.values(WORKFLOW_REGISTRY).map((w) => w.outputFile));
  const unrecognized = installedFiles.filter((f) => !recognizedFiles.has(f));

  if (unrecognized.length > 0) {
    console.log(chalk.blue('\n  Other workflows found:'));
    for (const file of unrecognized) {
      console.log(chalk.gray(`    • ${file}`));
    }
  }

  // show config info
  if (config) {
    console.log(chalk.blue('\n  Config:'));
    console.log(chalk.gray(`    Project: ${config.projectName}`));
    console.log(chalk.gray(`    Preset: ${config.preset}`));
    console.log(chalk.gray(`    Release: ${config.releaseStrategy}`));
    console.log(chalk.gray(`    Package Manager: ${config.packageManager}`));
  } else {
    console.log(chalk.yellow('\n  No .github-workflows.json found.'));
    console.log(chalk.gray('  Run `create-github-workflows init` to create one.'));
  }

  console.log('');
}
