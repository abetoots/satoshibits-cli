/**
 * Tests for project detection utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import {
  detectPackageManager,
  detectMonorepo,
  detectDockerfile,
  detectNodeVersion,
  getProjectName,
  detectProject,
} from './detector.js';

// mock fs module
vi.mock('node:fs');

const mockFs = vi.mocked(fs);

describe('detectPackageManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects pnpm from lock file', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('pnpm-lock.yaml');
    });

    expect(detectPackageManager('/test')).toBe('pnpm');
  });

  it('detects yarn from lock file', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('yarn.lock');
    });

    expect(detectPackageManager('/test')).toBe('yarn');
  });

  it('detects npm from lock file', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('package-lock.json');
    });

    expect(detectPackageManager('/test')).toBe('npm');
  });

  it('detects bun from lock file', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('bun.lockb');
    });

    expect(detectPackageManager('/test')).toBe('bun');
  });

  it('detects package manager from package.json packageManager field', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('package.json');
    });
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      packageManager: 'pnpm@8.0.0',
    }));

    expect(detectPackageManager('/test')).toBe('pnpm');
  });

  it('defaults to npm when nothing found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(detectPackageManager('/test')).toBe('npm');
  });
});

describe('detectMonorepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects monorepo from package.json workspaces', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('package.json');
    });
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      workspaces: ['packages/*'],
    }));

    expect(detectMonorepo('/test')).toBe(true);
  });

  it('detects monorepo from pnpm-workspace.yaml', () => {
    mockFs.existsSync.mockImplementation((p) => {
      const pathStr = String(p);
      // package.json exists but no workspaces, pnpm-workspace.yaml exists
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('pnpm-workspace.yaml')) return true;
      return false;
    });
    mockFs.readFileSync.mockReturnValue(JSON.stringify({})); // no workspaces

    expect(detectMonorepo('/test')).toBe(true);
  });

  it('detects monorepo from turbo.json', () => {
    mockFs.existsSync.mockImplementation((p) => {
      const pathStr = String(p);
      // package.json exists but no workspaces, turbo.json exists
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('turbo.json')) return true;
      return false;
    });
    mockFs.readFileSync.mockReturnValue(JSON.stringify({})); // no workspaces

    expect(detectMonorepo('/test')).toBe(true);
  });

  it('returns false when no monorepo indicators found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(detectMonorepo('/test')).toBe(false);
  });
});

describe('detectDockerfile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects Dockerfile in root', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).endsWith('Dockerfile') && !String(p).includes('docker/');
    });

    expect(detectDockerfile('/test')).toBe('./Dockerfile');
  });

  it('detects Dockerfile in docker directory', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).endsWith('docker/Dockerfile');
    });

    expect(detectDockerfile('/test')).toBe('./docker/Dockerfile');
  });

  it('returns null when no Dockerfile found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(detectDockerfile('/test')).toBeNull();
  });
});

describe('detectNodeVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects node version from .nvmrc', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('.nvmrc');
    });
    mockFs.readFileSync.mockReturnValue('v20.10.0');

    expect(detectNodeVersion('/test')).toBe('20');
  });

  it('detects node version from .node-version', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('.node-version');
    });
    mockFs.readFileSync.mockReturnValue('18.17.0');

    expect(detectNodeVersion('/test')).toBe('18');
  });

  it('detects node version from package.json engines', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p).includes('package.json');
    });
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      engines: { node: '>=20.11.0' },
    }));

    expect(detectNodeVersion('/test')).toBe('20');
  });

  it('returns null when no version found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(detectNodeVersion('/test')).toBeNull();
  });
});

describe('getProjectName', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('gets project name from package.json', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'my-project',
    }));

    expect(getProjectName('/test/my-project')).toBe('my-project');
  });

  it('removes scope from package name', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: '@org/my-project',
    }));

    expect(getProjectName('/test/my-project')).toBe('my-project');
  });

  it('falls back to directory name when no package.json', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(getProjectName('/test/fallback-name')).toBe('fallback-name');
  });
});

describe('detectProject', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('performs full project detection', () => {
    // setup mocks for a typical pnpm monorepo
    mockFs.existsSync.mockImplementation((p) => {
      const pathStr = String(p);
      return (
        pathStr.includes('pnpm-lock.yaml') ||
        pathStr.includes('pnpm-workspace.yaml') ||
        (pathStr.includes('package.json') && !pathStr.includes('.github'))
      );
    });
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: '@org/test-project',
      engines: { node: '>=20' },
    }));
    mockFs.readdirSync.mockReturnValue([]);

    const result = detectProject('/test');

    expect(result.packageManager).toBe('pnpm');
    expect(result.isMonorepo).toBe(true);
    expect(result.dockerfilePath).toBeNull();
    expect(result.nodeVersion).toBe('20');
    expect(result.projectName).toBe('test-project');
    expect(result.hasExistingWorkflows).toBe(false);
  });
});
