/**
 * Interactive prompt definitions using @inquirer/prompts
 */

import { select, input, confirm, checkbox } from '@inquirer/prompts';
import type {
  Preset,
  ReleaseStrategy,
  WorkflowName,
  DockerRegistry,
  PackageManager,
} from '../types.js';

export interface InitAnswers {
  projectName: string;
  preset: Preset;
  packageManager: PackageManager;
  nodeVersion: string;
  releaseStrategy: ReleaseStrategy;
  isMonorepo: boolean;
  hasDocker: boolean;
  dockerRegistry?: DockerRegistry;
  imageName?: string;
  hasNpm: boolean;
  npmAccess?: 'public' | 'restricted';
  hasDeployments: boolean;
  deployEnvironments?: ('staging' | 'preview' | 'production')[];
  stagingAppName?: string;
  previewAppName?: string;
  productionAppName?: string;
}

/**
 * asks for project name
 */
export async function askProjectName(defaultName: string): Promise<string> {
  return input({
    message: 'Project name:',
    default: defaultName,
    validate: (value) => {
      if (!value.trim()) {
        return 'Project name is required';
      }
      return true;
    },
  });
}

/**
 * asks for preset selection
 */
export async function askPreset(detected: {
  isMonorepo: boolean;
  dockerfilePath: string | null;
}): Promise<Preset> {
  // determine recommended preset based on detection
  let recommendedPreset: Preset = 'library';
  if (detected.dockerfilePath) {
    recommendedPreset = 'docker-app';
  } else if (detected.isMonorepo) {
    recommendedPreset = 'monorepo';
  }

  return select<Preset>({
    message: 'Select a workflow preset:',
    choices: [
      {
        name: `Library - NPM package publishing${recommendedPreset === 'library' ? ' (Recommended)' : ''}`,
        value: 'library',
        description: 'Release-please or changesets for version management, NPM publishing',
      },
      {
        name: `Docker App - Docker image workflows${recommendedPreset === 'docker-app' ? ' (Recommended)' : ''}`,
        value: 'docker-app',
        description: 'Docker build, tag, deploy with staging/preview/production',
      },
      {
        name: `Monorepo - Multi-package workspace${recommendedPreset === 'monorepo' ? ' (Recommended)' : ''}`,
        value: 'monorepo',
        description: 'Changesets for coordinated releases, NPM publishing',
      },
    ],
    default: recommendedPreset,
  });
}

/**
 * asks for package manager
 */
export async function askPackageManager(detected: PackageManager): Promise<PackageManager> {
  return select<PackageManager>({
    message: 'Package manager:',
    choices: [
      { name: 'pnpm', value: 'pnpm' },
      { name: 'npm', value: 'npm' },
      { name: 'yarn', value: 'yarn' },
      { name: 'bun', value: 'bun' },
    ],
    default: detected,
  });
}

/**
 * asks for node version
 */
export async function askNodeVersion(detected: string | null): Promise<string> {
  return input({
    message: 'Node.js version:',
    default: detected ?? '20',
    validate: (value) => {
      if (!value.trim()) {
        return 'Node version is required';
      }
      if (!/^\d+$/.test(value.trim())) {
        return 'Enter major version only (e.g., 20)';
      }
      return true;
    },
  });
}

/**
 * asks for release strategy
 */
export async function askReleaseStrategy(isMonorepo: boolean): Promise<ReleaseStrategy> {
  return select<ReleaseStrategy>({
    message: 'Release strategy:',
    choices: [
      {
        name: isMonorepo
          ? 'Changesets (Recommended for monorepos)'
          : 'Release Please (Recommended)',
        value: isMonorepo ? 'changesets' : 'release-please',
        description: isMonorepo
          ? 'Coordinated releases for multiple packages'
          : 'Automated version bumps and changelogs from conventional commits',
      },
      {
        name: isMonorepo ? 'Release Please' : 'Changesets',
        value: isMonorepo ? 'release-please' : 'changesets',
        description: isMonorepo
          ? 'Single package releases with conventional commits'
          : 'Manual changeset files for each change',
      },
    ],
    default: isMonorepo ? 'changesets' : 'release-please',
  });
}

/**
 * asks for docker configuration
 */
export async function askDockerConfig(
  projectName: string,
  detectedPath: string | null
): Promise<{ registry: DockerRegistry; imageName: string; dockerfilePath: string } | null> {
  const hasDocker = await confirm({
    message: detectedPath
      ? `Dockerfile detected at ${detectedPath}. Include Docker workflows?`
      : 'Include Docker workflows?',
    default: detectedPath !== null,
  });

  if (!hasDocker) {
    return null;
  }

  // ask for Dockerfile path if not detected
  const dockerfilePath = detectedPath ?? await input({
    message: 'Path to Dockerfile:',
    default: './Dockerfile',
    validate: (value) => {
      if (!value.trim()) {
        return 'Dockerfile path is required';
      }
      return true;
    },
  });

  const registry = await select<DockerRegistry>({
    message: 'Docker registry:',
    choices: [
      {
        name: 'GitHub Container Registry (Recommended)',
        value: 'ghcr',
        description: 'Free for public repos, integrated with GitHub',
      },
      {
        name: 'Docker Hub',
        value: 'dockerhub',
        description: 'Most widely used registry',
      },
      {
        name: 'Amazon ECR',
        value: 'ecr',
        description: 'AWS native registry',
      },
    ],
    default: 'ghcr',
  });

  const imageName = await input({
    message: 'Docker image name:',
    default: projectName,
    validate: (value) => {
      if (!value.trim()) {
        return 'Image name is required';
      }
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(value.trim())) {
        return 'Image name must be lowercase and start with a letter or number';
      }
      return true;
    },
  });

  return { registry, imageName, dockerfilePath };
}

/**
 * asks for npm configuration
 */
export async function askNpmConfig(
  preset: Preset
): Promise<{ publish: boolean; access: 'public' | 'restricted' } | null> {
  const shouldPublish = preset !== 'docker-app';

  if (!shouldPublish) {
    const wantsNpm = await confirm({
      message: 'Include NPM publishing workflow?',
      default: false,
    });

    if (!wantsNpm) {
      return null;
    }
  }

  const access = await select<'public' | 'restricted'>({
    message: 'NPM package access:',
    choices: [
      { name: 'Public', value: 'public', description: 'Anyone can install' },
      { name: 'Restricted', value: 'restricted', description: 'Only authorized users' },
    ],
    default: 'public',
  });

  return { publish: true, access };
}

/**
 * asks for deployment environments
 */
export async function askDeploymentConfig(
  projectName: string
): Promise<{ name: 'staging' | 'preview' | 'production'; appName: string }[]> {
  const hasDeployments = await confirm({
    message: 'Include deployment workflows?',
    default: true,
  });

  if (!hasDeployments) {
    return [];
  }

  const environments = await checkbox<'staging' | 'preview' | 'production'>({
    message: 'Select deployment environments:',
    choices: [
      { name: 'Staging', value: 'staging', checked: true },
      { name: 'Preview', value: 'preview', checked: true },
      { name: 'Production', value: 'production', checked: true },
    ],
  });

  const result: { name: 'staging' | 'preview' | 'production'; appName: string }[] = [];

  for (const env of environments) {
    const appName = await input({
      message: `${env.charAt(0).toUpperCase() + env.slice(1)} app name (DigitalOcean):`,
      default: `${projectName}-${env}`,
    });
    result.push({ name: env, appName });
  }

  return result;
}

/**
 * asks which workflows to include
 */
export async function askWorkflows(
  _preset: Preset,
  releaseStrategy: ReleaseStrategy,
  hasDocker: boolean,
  hasNpm: boolean,
  deployEnvironments: string[]
): Promise<WorkflowName[]> {
  const allWorkflows: {
    name: string;
    value: WorkflowName;
    checked: boolean;
    disabled?: string;
  }[] = [
    // ci
    { name: 'PR Validation (lint, typecheck, test)', value: 'pr-validation', checked: true },
    {
      name: 'Build (main branch protection)',
      value: 'build',
      checked: hasDocker,
      disabled: !hasDocker ? 'Requires Docker' : undefined,
    },
    // release
    {
      name: 'Release Please',
      value: 'release-please',
      checked: releaseStrategy === 'release-please',
    },
    {
      name: 'Changesets',
      value: 'changesets',
      checked: releaseStrategy === 'changesets',
    },
    // publish
    {
      name: 'NPM Publish',
      value: 'npm',
      checked: hasNpm,
      disabled: !hasNpm ? 'Not configured' : undefined,
    },
    {
      name: 'Docker Publish',
      value: 'docker',
      checked: hasDocker,
      disabled: !hasDocker ? 'Not configured' : undefined,
    },
    // deploy
    {
      name: 'Deploy Staging',
      value: 'staging',
      checked: deployEnvironments.includes('staging'),
      disabled: !deployEnvironments.includes('staging') ? 'Not configured' : undefined,
    },
    {
      name: 'Deploy Preview',
      value: 'preview',
      checked: deployEnvironments.includes('preview'),
      disabled: !deployEnvironments.includes('preview') ? 'Not configured' : undefined,
    },
    {
      name: 'Deploy Production',
      value: 'production',
      checked: deployEnvironments.includes('production'),
      disabled: !deployEnvironments.includes('production') ? 'Not configured' : undefined,
    },
  ];

  // filter out disabled workflows for selection
  const enabledWorkflows = allWorkflows.filter((w) => !w.disabled);

  const selected = await checkbox<WorkflowName>({
    message: 'Select workflows to generate:',
    choices: enabledWorkflows,
  });

  return selected;
}
