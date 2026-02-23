/**
 * Tests for WORKFLOW_REGISTRY and WORKFLOW_SECRETS completeness
 */

import { describe, it, expect } from 'vitest';
import { WORKFLOW_REGISTRY, WORKFLOW_SECRETS } from './types.js';
import type { WorkflowName } from './types.js';

const ALL_WORKFLOWS: WorkflowName[] = [
  'pr-validation', 'build',
  'release-please', 'changesets',
  'npm', 'docker',
  'staging', 'preview', 'production',
  'codeql', 'dependency-audit',
  'dependabot', 'stale',
  'docs-deploy',
];

function getRegistryEntry(name: WorkflowName) {
  return WORKFLOW_REGISTRY[name];
}

function getSecrets(name: WorkflowName) {
  return WORKFLOW_SECRETS[name];
}

describe('WORKFLOW_REGISTRY', () => {
  it('contains all expected workflow entries', () => {
    for (const name of ALL_WORKFLOWS) {
      const entry = getRegistryEntry(name);
      expect(entry).toBeDefined();
      expect(entry.name).toBe(name);
      expect(entry.templateFile).toBeTruthy();
      expect(entry.outputFile).toBeTruthy();
    }
  });

  it('dependabot has custom outputDir pointing to .github', () => {
    const entry = getRegistryEntry('dependabot');
    expect(entry.outputDir).toBe('.github');
  });

  it('non-dependabot workflows do not have outputDir override', () => {
    const nonDependabot = ALL_WORKFLOWS.filter((w) => w !== 'dependabot');
    for (const name of nonDependabot) {
      const entry = getRegistryEntry(name);
      expect(entry.outputDir).toBeUndefined();
    }
  });

  it('security workflows have correct category', () => {
    expect(getRegistryEntry('codeql').category).toBe('security');
    expect(getRegistryEntry('dependency-audit').category).toBe('security');
  });

  it('maintenance workflows have correct category', () => {
    expect(getRegistryEntry('dependabot').category).toBe('maintenance');
    expect(getRegistryEntry('stale').category).toBe('maintenance');
  });

  it('docs workflows have correct category', () => {
    expect(getRegistryEntry('docs-deploy').category).toBe('docs');
  });
});

describe('WORKFLOW_SECRETS', () => {
  it('has entries for all registered workflows', () => {
    for (const name of Object.keys(WORKFLOW_REGISTRY) as WorkflowName[]) {
      const secrets = getSecrets(name);
      expect(secrets).toBeDefined();
      expect(Array.isArray(secrets)).toBe(true);
    }
  });

  it('new security/maintenance/docs workflows require no manual secrets', () => {
    expect(getSecrets('codeql')).toEqual([]);
    expect(getSecrets('dependency-audit')).toEqual([]);
    expect(getSecrets('dependabot')).toEqual([]);
    expect(getSecrets('stale')).toEqual([]);
    expect(getSecrets('docs-deploy')).toEqual([]);
  });
});
