/**
 * init command - scaffolds GitHub workflows based on preset
 */

import * as fs from 'node:fs';
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
  askGenerateReleaseConfig,
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
import { WORKFLOW_REGISTRY, WORKFLOW_SECRETS, PLATFORM_SECRETS, DOCKER_REGISTRY_SECRETS } from '../types.js';
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

  // generate release config if using release-please
  let generatedReleaseConfig = false;
  if (config.releaseStrategy === 'release-please') {
    const configPath = path.join(cwd, 'release-please-config.json');
    const configExists = fs.existsSync(configPath);
    const shouldGenerate = options.yes ? !configExists : await askGenerateReleaseConfig(configExists);

    if (shouldGenerate) {
      const spinner3 = ora('Generating release-please config...').start();
      const releaseResults = await generateReleaseConfig(config, cwd, options.force);
      spinner3.succeed('Release config generated');
      printWriteSummary(releaseResults);
      generatedReleaseConfig = true;
    }
  }

  // save config
  saveConfig(config, cwd);
  console.log(chalk.gray(`\n  Saved: .github-workflows.json`));

  // show required secrets
  printRequiredSecrets(config.workflows, config.deployEnvironments, config.docker);

  // show next steps
  printNextSteps(config, generatedReleaseConfig);
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
  // default to digitalocean platform in quick mode
  if (presetDef.deployEnvironments.length > 0) {
    config.deployEnvironments = presetDef.deployEnvironments.map((env) => ({
      name: env,
      enabled: true,
      platform: 'digitalocean' as const,
      digitalocean: { appName: `${detected.projectName}-${env}` },
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

  // docker config - skip confirmation if docker-app preset is selected
  const dockerResult = preset === 'docker-app'
    ? await askDockerConfig(projectName, detected.dockerfilePath, true)
    : await askDockerConfig(projectName, detected.dockerfilePath);
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

  // deployment config - already returns DeployEnvironment[]
  const deployEnvironments: DeployEnvironment[] = await askDeploymentConfig(projectName);

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
 * generates release-please config files
 */
async function generateReleaseConfig(
  config: WorkflowConfig,
  cwd: string,
  force?: boolean
): Promise<WriteResult[]> {
  const results: WriteResult[] = [];

  const context = createTemplateContext(
    config.projectName,
    config.packageManager,
    config.nodeVersion,
    config.isMonorepo
  );

  // generate release-please-config.json
  const configContent = renderAndValidate('config/release-please-config.json.hbs', context);
  const configPath = path.join(cwd, 'release-please-config.json');
  results.push(
    await writeFileWithProtection(configPath, configContent, { force, backup: true })
  );

  // generate .release-please-manifest.json
  const manifestContent = renderAndValidate('config/release-please-manifest.json.hbs', context);
  const manifestPath = path.join(cwd, '.release-please-manifest.json');
  results.push(
    await writeFileWithProtection(manifestPath, manifestContent, { force, backup: true })
  );

  return results;
}

/**
 * collects secrets required by selected deployment platforms
 */
function getDeploymentSecrets(deployEnvironments: DeployEnvironment[]): SecretInfo[] {
  const platformsUsed = new Set(
    deployEnvironments.filter((env) => env.enabled).map((env) => env.platform)
  );

  const secrets: SecretInfo[] = [];
  for (const platform of platformsUsed) {
    const platformSecrets = PLATFORM_SECRETS[platform] ?? [];
    secrets.push(...platformSecrets);
  }

  return secrets;
}

/**
 * prints required secrets table
 */
function printRequiredSecrets(
  workflows: WorkflowName[],
  deployEnvironments: DeployEnvironment[],
  dockerConfig: DockerConfig | null
): void {
  const secretsMap = new Map<string, SecretInfo>();

  // collect workflow secrets
  for (const workflowName of workflows) {
    const secrets = WORKFLOW_SECRETS[workflowName] ?? [];
    for (const secret of secrets) {
      if (!secretsMap.has(secret.name)) {
        secretsMap.set(secret.name, secret);
      }
    }
  }

  // collect docker registry secrets
  if (dockerConfig) {
    const registrySecrets = DOCKER_REGISTRY_SECRETS[dockerConfig.registry] ?? [];
    for (const secret of registrySecrets) {
      if (!secretsMap.has(secret.name)) {
        secretsMap.set(secret.name, secret);
      }
    }
  }

  // collect platform-specific deployment secrets
  const deploySecrets = getDeploymentSecrets(deployEnvironments);
  for (const secret of deploySecrets) {
    if (!secretsMap.has(secret.name)) {
      secretsMap.set(secret.name, secret);
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
function printNextSteps(config: WorkflowConfig, generatedReleaseConfig: boolean): void {
  console.log(chalk.green('\n✓ Workflows generated successfully!\n'));

  console.log(chalk.blue('Next steps:'));
  console.log('  1. Review generated workflows in .github/workflows/');
  console.log('  2. Configure required secrets in GitHub repository settings');

  let stepNum = 3;
  if (config.releaseStrategy === 'release-please' && !generatedReleaseConfig) {
    console.log(`  ${stepNum}. Create release-please-config.json and .release-please-manifest.json`);
    stepNum++;
  } else if (config.releaseStrategy === 'changesets') {
    console.log(`  ${stepNum}. Run \`npx changeset init\` to set up changesets`);
    stepNum++;
  }

  console.log(`  ${stepNum}. Use \`create-github-workflows list\` to see installed workflows`);
  console.log(`  ${stepNum + 1}. Use \`create-github-workflows add <workflow>\` to add more workflows`);
}
