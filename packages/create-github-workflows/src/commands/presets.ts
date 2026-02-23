/**
 * Preset definitions for common workflow configurations
 */

import type { Preset, PresetDefinition } from '../types.js';

const PRESETS: Record<Preset, PresetDefinition> = {
  library: {
    name: 'library',
    description: 'NPM package publishing with release-please or changesets',
    releaseStrategy: 'release-please',
    workflows: ['pr-validation', 'release-please', 'npm', 'codeql', 'dependabot'],
    hasDocker: false,
    hasNpm: true,
    deployEnvironments: [],
  },
  'docker-app': {
    name: 'docker-app',
    description: 'Docker application with build, publish, and deploy workflows',
    releaseStrategy: 'release-please',
    workflows: [
      'pr-validation',
      'build',
      'release-please',
      'docker',
      'staging',
      'preview',
      'production',
      'codeql',
      'dependabot',
    ],
    hasDocker: true,
    hasNpm: false,
    deployEnvironments: ['staging', 'preview', 'production'],
  },
  monorepo: {
    name: 'monorepo',
    description: 'Multi-package workspace with changesets for coordinated releases',
    releaseStrategy: 'changesets',
    workflows: ['pr-validation', 'changesets', 'npm', 'codeql', 'dependabot'],
    hasDocker: false,
    hasNpm: true,
    deployEnvironments: [],
  },
};

/**
 * loads a preset definition
 */
export function loadPreset(preset: Preset): PresetDefinition {
  const definition = PRESETS[preset];
  if (!definition) {
    throw new Error(`Unknown preset: ${preset}`);
  }
  return definition;
}

/**
 * gets all available presets
 */
export function getAvailablePresets(): PresetDefinition[] {
  return Object.values(PRESETS);
}

/**
 * checks if a preset exists
 */
export function isValidPreset(preset: string): preset is Preset {
  return preset in PRESETS;
}
