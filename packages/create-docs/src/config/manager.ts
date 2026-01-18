/**
 * configuration file manager for .create-docs.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CreateDocsConfig } from '../types.js';

const CONFIG_FILENAME = '.create-docs.json';

export function getConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export function configExists(cwd: string = process.cwd()): boolean {
  return fs.existsSync(getConfigPath(cwd));
}

export function loadConfig(cwd: string = process.cwd()): CreateDocsConfig | null {
  const configPath = getConfigPath(cwd);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as CreateDocsConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: CreateDocsConfig, cwd: string = process.cwd()): void {
  const configPath = getConfigPath(cwd);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function createDefaultConfig(
  projectName: string,
  profile: CreateDocsConfig['profile'],
  owner: string,
  variance: CreateDocsConfig['variance']
): CreateDocsConfig {
  return {
    projectName,
    profile,
    owner,
    adrCounter: 0,
    variance,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export function getNextAdrNumber(cwd: string = process.cwd()): number {
  const config = loadConfig(cwd);
  if (!config) {
    throw new Error('No .create-docs.json found. Run `create-docs init` first.');
  }
  return config.adrCounter + 1;
}

export function incrementAdrCounter(cwd: string = process.cwd()): number {
  const config = loadConfig(cwd);
  if (!config) {
    throw new Error('No .create-docs.json found. Run `create-docs init` first.');
  }

  config.adrCounter += 1;
  saveConfig(config, cwd);
  return config.adrCounter;
}

export function getDocsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'docs');
}

export function docsExist(cwd: string = process.cwd()): boolean {
  return fs.existsSync(getDocsPath(cwd));
}
