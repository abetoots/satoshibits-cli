/**
 * init command - scaffolds GitHub workflows based on preset
 */

import * as path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  configExists,
  saveConfig,
  createDefaultConfig,
  getWorkflowsPath,
  CONFIG_VERSION,
} from '../config/manager.js';
import { detectProject } from '../utils/detector.js';
import { renderAndValidate, createTemplateContext } from '../templates/renderer.js';
import { writeFileWithProtection, printWriteSummary, type WriteResult } from '../utils/writer.js';
import {
  askProjectName,
  askPreset,
  askPackageManager,
  askNodeVersion,
  askReleaseStrategy,
  askDockerConfig,
  askNpmConfig,
  askDeploymentConfig,
  askWorkflows,
} from '../prompts/questions.js';
import type {
  InitOptions,
  WorkflowConfig,
  WorkflowName,
  SecretInfo,
  Preset,
  DockerConfig,
  DeployEnvironment,
  NpmConfig,
} from '../types.js';
import { WORKFLOW_REGISTRY, WORKFLOW_SECRETS } from '../types.js';
import { loadPreset } from './presets.js';

interface InitContext {
  cwd: string;
  detected: ReturnType<typeof detectProject>;
  options: InitOptions;
}

/**
 * runs the init command
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const spinner = ora('Detecting project...').start();

  const detected = detectProject(cwd);
  spinner.succeed('Project detected');

  // show detected info
  console.log(chalk.gray(`  Package manager: ${detected.packageManager}`));
  console.log(chalk.gray(`  Monorepo: ${detected.isMonorepo ? 'Yes' : 'No'}`));
  console.log(chalk.gray(`  Dockerfile: ${detected.dockerfilePath ?? 'Not found'}`));
  console.log(chalk.gray(`  Node version: ${detected.nodeVersion ?? 'Not detected'}`));
  if (detected.hasExistingWorkflows) {
    console.log(chalk.gray(`  Existing workflows: ${detected.existingWorkflows.join(', ')}`));
  }
  console.log('');

  // check for existing config
  const hasExistingConfig = configExists(cwd);
  if (hasExistingConfig && !options.force) {
    console.log(chalk.yellow('.github-workflows.json already exists.'));
    console.log(chalk.gray('Use --force to regenerate workflows.\n'));
  }

  let config: WorkflowConfig;

  if (options.yes && options.preset) {
    // quick mode with preset
    config = createConfigFromPreset(
      options.preset,
      detected
    );
  } else if (options.preset) {
    // preset specified but interactive for remaining options
    config = await createConfigInteractive(
      { cwd, detected, options },
      options.preset
    );
  } else {
    // fully interactive mode
    config = await createConfigInteractive({ cwd, detected, options });
  }

  // generate workflows
  const spinner2 = ora('Generating workflows...').start();
  const results = await generateWorkflows(config, cwd, options.force);
  spinner2.succeed('Workflows generated');

  printWriteSummary(results);

  // save config
  saveConfig(config, cwd);
  console.log(chalk.gray(`\n  Saved: .github-workflows.json`));

  // show required secrets
  printRequiredSecrets(config.workflows);

  // show next steps
  printNextSteps(config);
}

/**
 * creates config from preset with defaults
 */
function createConfigFromPreset(
  preset: Preset,
  detected: ReturnType<typeof detectProject>
): WorkflowConfig {
  const presetDef = loadPreset(preset);

  const config = createDefaultConfig(
    detected.projectName,
    preset,
    detected.packageManager,
    presetDef.releaseStrategy,
    detected.nodeVersion ?? '20',
    detected.isMonorepo,
    presetDef.workflows
  );

  // add docker config if preset includes it
  if (presetDef.hasDocker && detected.dockerfilePath) {
    config.docker = {
      registry: 'ghcr',
      imageName: detected.projectName,
      dockerfilePath: detected.dockerfilePath,
      buildTargets: [],
    };
  }

  // add npm config if preset includes it
  if (presetDef.hasNpm) {
    config.npm = {
      publish: true,
      access: 'public',
    };
  }

  // add deploy environments if preset includes them
  if (presetDef.deployEnvironments.length > 0) {
    config.deployEnvironments = presetDef.deployEnvironments.map((env) => ({
      name: env,
      appName: `${detected.projectName}-${env}`,
      enabled: true,
    }));
  }

  return config;
}

/**
 * creates config interactively
 */
async function createConfigInteractive(
  ctx: InitContext,
  preselectedPreset?: Preset
): Promise<WorkflowConfig> {
  const { detected } = ctx;

  // project name
  const projectName = await askProjectName(detected.projectName);

  // preset
  const preset = preselectedPreset ?? await askPreset({
    isMonorepo: detected.isMonorepo,
    dockerfilePath: detected.dockerfilePath,
  });

  // package manager
  const packageManager = await askPackageManager(detected.packageManager);

  // node version
  const nodeVersion = await askNodeVersion(detected.nodeVersion);

  // release strategy
  const releaseStrategy = await askReleaseStrategy(detected.isMonorepo);

  // docker config
  const dockerResult = await askDockerConfig(projectName, detected.dockerfilePath);
  const docker: DockerConfig | null = dockerResult
    ? {
        registry: dockerResult.registry,
        imageName: dockerResult.imageName,
        dockerfilePath: dockerResult.dockerfilePath,
        buildTargets: [],
      }
    : null;

  // npm config
  const npm: NpmConfig | null = await askNpmConfig(preset);

  // deployment config
  const deploymentResult = await askDeploymentConfig(projectName);
  const deployEnvironments: DeployEnvironment[] = deploymentResult.map((d) => ({
    name: d.name,
    appName: d.appName,
    enabled: true,
  }));

  // workflow selection
  const workflows = await askWorkflows(
    preset,
    releaseStrategy,
    docker !== null,
    npm !== null,
    deployEnvironments.map((d) => d.name)
  );

  return {
    version: CONFIG_VERSION,
    projectName,
    preset,
    packageManager,
    releaseStrategy,
    nodeVersion,
    isMonorepo: detected.isMonorepo,
    docker,
    deployEnvironments,
    workflows,
    npm,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * generates workflow files from config
 */
async function generateWorkflows(
  config: WorkflowConfig,
  cwd: string,
  force?: boolean
): Promise<WriteResult[]> {
  const workflowsDir = getWorkflowsPath(cwd);
  const results: WriteResult[] = [];

  const context = createTemplateContext(
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
  );

  for (const workflowName of config.workflows) {
    const workflowInfo = WORKFLOW_REGISTRY[workflowName];
    if (!workflowInfo) {
      console.log(chalk.yellow(`  Warning: Unknown workflow ${workflowName}, skipping`));
      continue;
    }

    try {
      const content = renderAndValidate(workflowInfo.templateFile, context);
      const outputPath = path.join(workflowsDir, workflowInfo.outputFile);

      const result = await writeFileWithProtection(outputPath, content, {
        force,
        backup: true,
      });
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`  Error generating ${workflowName}: ${message}`));
    }
  }

  return results;
}

/**
 * prints required secrets table
 */
function printRequiredSecrets(workflows: WorkflowName[]): void {
  const secretsMap = new Map<string, SecretInfo>();

  for (const workflowName of workflows) {
    const secrets = WORKFLOW_SECRETS[workflowName] ?? [];
    for (const secret of secrets) {
      if (!secretsMap.has(secret.name)) {
        secretsMap.set(secret.name, secret);
      }
    }
  }

  if (secretsMap.size === 0) {
    return;
  }

  console.log(chalk.blue('\n📋 Required GitHub Secrets:'));
  console.log(chalk.gray('  Configure these in: Settings → Secrets and variables → Actions\n'));

  for (const [name, secret] of secretsMap) {
    if (name === 'GITHUB_TOKEN') {
      console.log(chalk.gray(`  • ${name} - ${secret.description}`));
    } else {
      console.log(chalk.yellow(`  • ${name}`));
      console.log(chalk.gray(`    ${secret.description}`));
    }
  }
}

/**
 * prints next steps
 */
function printNextSteps(config: WorkflowConfig): void {
  console.log(chalk.green('\n✓ Workflows generated successfully!\n'));

  console.log(chalk.blue('Next steps:'));
  console.log('  1. Review generated workflows in .github/workflows/');
  console.log('  2. Configure required secrets in GitHub repository settings');

  if (config.releaseStrategy === 'release-please') {
    console.log('  3. Create release-please-config.json and .release-please-manifest.json');
  } else if (config.releaseStrategy === 'changesets') {
    console.log('  3. Run `npx changeset init` to set up changesets');
  }

  console.log('  4. Use `create-github-workflows list` to see installed workflows');
  console.log('  5. Use `create-github-workflows add <workflow>` to add more workflows');
}
