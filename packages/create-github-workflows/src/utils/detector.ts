/**
 * Project type detection utilities
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DetectedProject, PackageManager } from '../types.js';

interface PackageJson {
  name?: string;
  packageManager?: string;
  workspaces?: string[] | { packages: string[] };
  engines?: {
    node?: string;
  };
}

/**
 * detects the package manager used in the project
 */
export function detectPackageManager(cwd: string = process.cwd()): PackageManager {
  // check lock files in priority order
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) {
    return 'npm';
  }

  // check packageManager field in package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
      if (pkg.packageManager) {
        const match = /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager);
        if (match?.[1]) {
          return match[1] as PackageManager;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return 'npm';
}

/**
 * detects if the project is a monorepo
 */
export function detectMonorepo(cwd: string = process.cwd()): boolean {
  const pkgPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return false;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;

    // check for workspaces field (npm/yarn/pnpm)
    if (pkg.workspaces) {
      return true;
    }
  } catch {
    // ignore parse errors
  }

  // check for pnpm-workspace.yaml
  if (fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))) {
    return true;
  }

  // check for lerna.json
  if (fs.existsSync(path.join(cwd, 'lerna.json'))) {
    return true;
  }

  // check for nx.json
  if (fs.existsSync(path.join(cwd, 'nx.json'))) {
    return true;
  }

  // check for turbo.json
  if (fs.existsSync(path.join(cwd, 'turbo.json'))) {
    return true;
  }

  return false;
}

/**
 * detects if the project has a Dockerfile and returns its path
 * returns null if no Dockerfile is found
 */
export function detectDockerfile(cwd: string = process.cwd()): string | null {
  const candidates = ['Dockerfile', 'dockerfile', 'docker/Dockerfile'];
  for (const file of candidates) {
    if (fs.existsSync(path.join(cwd, file))) {
      return `./${file}`;
    }
  }
  return null;
}

/**
 * detects the Node.js version from .nvmrc or package.json engines
 */
export function detectNodeVersion(cwd: string = process.cwd()): string | null {
  // check .nvmrc first
  const nvmrcPath = path.join(cwd, '.nvmrc');
  if (fs.existsSync(nvmrcPath)) {
    try {
      const version = fs.readFileSync(nvmrcPath, 'utf-8').trim();
      // extract major version (e.g., "20" from "v20.10.0" or "20.10.0" or "lts/iron")
      const match = /^v?(\d+)/.exec(version);
      if (match?.[1]) {
        return match[1];
      }
    } catch {
      // ignore read errors
    }
  }

  // check .node-version
  const nodeVersionPath = path.join(cwd, '.node-version');
  if (fs.existsSync(nodeVersionPath)) {
    try {
      const version = fs.readFileSync(nodeVersionPath, 'utf-8').trim();
      const match = /^v?(\d+)/.exec(version);
      if (match?.[1]) {
        return match[1];
      }
    } catch {
      // ignore read errors
    }
  }

  // check package.json engines
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
      if (pkg.engines?.node) {
        // extract version from engine spec (e.g., ">=20" -> "20", "^20.11.0" -> "20")
        const match = /(\d+)/.exec(pkg.engines.node);
        if (match?.[1]) {
          return match[1];
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

/**
 * gets the project name from package.json
 */
export function getProjectName(cwd: string = process.cwd()): string {
  const pkgPath = path.join(cwd, 'package.json');

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
      if (pkg.name) {
        // remove scope if present (e.g., "@org/name" -> "name")
        return pkg.name.replace(/^@[^/]+\//, '');
      }
    } catch {
      // ignore parse errors
    }
  }

  // fallback to directory name
  return path.basename(cwd);
}

/**
 * gets list of existing workflow files
 */
export function getExistingWorkflows(cwd: string = process.cwd()): string[] {
  const workflowsDir = path.join(cwd, '.github', 'workflows');

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

/**
 * performs full project detection
 */
export function detectProject(cwd: string = process.cwd()): DetectedProject {
  const existingWorkflows = getExistingWorkflows(cwd);

  return {
    packageManager: detectPackageManager(cwd),
    isMonorepo: detectMonorepo(cwd),
    dockerfilePath: detectDockerfile(cwd),
    nodeVersion: detectNodeVersion(cwd),
    hasExistingWorkflows: existingWorkflows.length > 0,
    existingWorkflows,
    projectName: getProjectName(cwd),
  };
}
