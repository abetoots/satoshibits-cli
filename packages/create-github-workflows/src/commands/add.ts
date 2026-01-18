/**
 * add command - adds individual workflows
 */

import * as path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  configExists,
  loadConfig,
  saveConfig,
  getWorkflowsPath,
} from '../config/manager.js';
import { renderAndValidate, createTemplateContext } from '../templates/renderer.js';
import { writeFileWithProtection } from '../utils/writer.js';
import type { AddOptions, WorkflowName } from '../types.js';
import { WORKFLOW_REGISTRY, WORKFLOW_SECRETS } from '../types.js';

/**
 * runs the add command
 */
export async function addCommand(
  workflowName: string,
  options: AddOptions = {}
): Promise<void> {
  const cwd = process.cwd();

  // validate workflow name
  if (!isValidWorkflow(workflowName)) {
    console.log(chalk.red(`Unknown workflow: ${workflowName}`));
    console.log(chalk.gray('\nAvailable workflows:'));
    listAvailableWorkflows();
    process.exit(1);
  }

  const workflow = workflowName;
  const workflowInfo = WORKFLOW_REGISTRY[workflow];

  // check for config
  if (!configExists(cwd)) {
    console.log(chalk.yellow('No .github-workflows.json found.'));
    console.log(chalk.gray('Run `create-github-workflows init` first, or create a minimal config.\n'));

    // still try to generate with defaults
    console.log(chalk.gray('Generating with default settings...\n'));
  }

  const config = loadConfig(cwd);
  const context = config
    ? createTemplateContext(
        config.projectName,
        config.packageManager,
        config.nodeVersion,
        config.isMonorepo,
        {
          docker: config.docker,
          deployEnvironments: config.deployEnvironments,
          releaseStrategy: config.releaseStrategy,
          npm: config.npm,
        }
      )
    : createTemplateContext(
        path.basename(cwd),
        'npm',
        '20',
        false
      );

  const spinner = ora(`Generating ${workflowInfo.name}...`).start();

  try {
    const content = renderAndValidate(workflowInfo.templateFile, context);
    const outputPath = path.join(getWorkflowsPath(cwd), workflowInfo.outputFile);

    const result = await writeFileWithProtection(outputPath, content, {
      force: options.force,
      backup: true,
      silent: true,
    });

    spinner.succeed(`Generated ${workflowInfo.name}`);

    if (result.action === 'created') {
      console.log(chalk.gray(`  Created: .github/workflows/${workflowInfo.outputFile}`));
    } else if (result.action === 'updated' || result.action === 'backed-up') {
      console.log(chalk.gray(`  Updated: .github/workflows/${workflowInfo.outputFile}`));
      if (result.backupPath) {
        console.log(chalk.gray(`  Backup: ${path.basename(result.backupPath)}`));
      }
    } else {
      console.log(chalk.gray(`  Skipped: .github/workflows/${workflowInfo.outputFile}`));
    }

    // update config if it exists
    if (config && !config.workflows.includes(workflow)) {
      config.workflows.push(workflow);
      saveConfig(config, cwd);
      console.log(chalk.gray(`  Updated: .github-workflows.json`));
    }

    // show required secrets
    const secrets = WORKFLOW_SECRETS[workflow] ?? [];
    if (secrets.length > 0) {
      console.log(chalk.blue('\n📋 Required secrets:'));
      for (const secret of secrets) {
        if (secret.name === 'GITHUB_TOKEN') {
          console.log(chalk.gray(`  • ${secret.name} - ${secret.description}`));
        } else {
          console.log(chalk.yellow(`  • ${secret.name}`));
          console.log(chalk.gray(`    ${secret.description}`));
        }
      }
    }
  } catch (error) {
    spinner.fail(`Failed to generate ${workflowInfo.name}`);
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`  Error: ${message}`));
    process.exit(1);
  }
}

/**
 * checks if a workflow name is valid
 */
function isValidWorkflow(name: string): name is WorkflowName {
  return name in WORKFLOW_REGISTRY;
}

/**
 * lists available workflows
 */
function listAvailableWorkflows(): void {
  const categories = {
    ci: [] as { name: string; description: string }[],
    release: [] as { name: string; description: string }[],
    publish: [] as { name: string; description: string }[],
    deploy: [] as { name: string; description: string }[],
  };

  for (const [name, info] of Object.entries(WORKFLOW_REGISTRY)) {
    categories[info.category].push({ name, description: info.description });
  }

  for (const [category, workflows] of Object.entries(categories)) {
    console.log(chalk.blue(`\n  ${category.toUpperCase()}`));
    for (const workflow of workflows) {
      console.log(chalk.white(`    ${workflow.name}`));
      console.log(chalk.gray(`      ${workflow.description}`));
    }
  }
}
