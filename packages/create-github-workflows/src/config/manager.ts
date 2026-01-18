/**
 * Configuration file manager for .github-workflows.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkflowConfig, Preset, PackageManager, ReleaseStrategy, WorkflowName } from '../types.js';

const CONFIG_FILENAME = '.github-workflows.json';

export function getConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export function configExists(cwd: string = process.cwd()): boolean {
  return fs.existsSync(getConfigPath(cwd));
}

export function loadConfig(cwd: string = process.cwd()): WorkflowConfig | null {
  const configPath = getConfigPath(cwd);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as WorkflowConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: WorkflowConfig, cwd: string = process.cwd()): void {
  const configPath = getConfigPath(cwd);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getWorkflowsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, '.github', 'workflows');
}

export function workflowsExist(cwd: string = process.cwd()): boolean {
  return fs.existsSync(getWorkflowsPath(cwd));
}

/** Current config schema version */
export const CONFIG_VERSION = 1;

export function createDefaultConfig(
  projectName: string,
  preset: Preset,
  packageManager: PackageManager,
  releaseStrategy: ReleaseStrategy,
  nodeVersion: string,
  isMonorepo: boolean,
  workflows: WorkflowName[]
): WorkflowConfig {
  return {
    version: CONFIG_VERSION,
    projectName,
    preset,
    packageManager,
    releaseStrategy,
    nodeVersion,
    isMonorepo,
    docker: null,
    deployEnvironments: [],
    workflows,
    npm: null,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * gets the list of installed workflow files in .github/workflows
 */
export function getInstalledWorkflows(cwd: string = process.cwd()): string[] {
  const workflowsDir = getWorkflowsPath(cwd);

  if (!fs.existsSync(workflowsDir)) {
    return [];
  }

  try {
    return fs.readdirSync(workflowsDir)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));
  } catch {
    return [];
  }
}
