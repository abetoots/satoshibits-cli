/**
 * Tests for preset definitions
 */

import { describe, it, expect } from 'vitest';
import { loadPreset, getAvailablePresets, isValidPreset } from './presets.js';

describe('loadPreset', () => {
  it('loads library preset with security and maintenance workflows', () => {
    const preset = loadPreset('library');
    expect(preset.name).toBe('library');
    expect(preset.workflows).toContain('pr-validation');
    expect(preset.workflows).toContain('release-please');
    expect(preset.workflows).toContain('npm');
    expect(preset.workflows).toContain('codeql');
    expect(preset.workflows).toContain('dependabot');
    expect(preset.hasDocker).toBe(false);
    expect(preset.hasNpm).toBe(true);
  });

  it('loads docker-app preset with security and maintenance workflows', () => {
    const preset = loadPreset('docker-app');
    expect(preset.workflows).toContain('codeql');
    expect(preset.workflows).toContain('dependabot');
    expect(preset.hasDocker).toBe(true);
    expect(preset.deployEnvironments).toEqual(['staging', 'preview', 'production']);
  });

  it('loads monorepo preset with security and maintenance workflows', () => {
    const preset = loadPreset('monorepo');
    expect(preset.releaseStrategy).toBe('changesets');
    expect(preset.workflows).toContain('codeql');
    expect(preset.workflows).toContain('dependabot');
  });

  it('throws for unknown preset', () => {
    // @ts-expect-error testing invalid input
    expect(() => loadPreset('invalid')).toThrow('Unknown preset: invalid');
  });
});

describe('getAvailablePresets', () => {
  it('returns all three presets', () => {
    const presets = getAvailablePresets();
    expect(presets).toHaveLength(3);
    const names = presets.map((p) => p.name);
    expect(names).toContain('library');
    expect(names).toContain('docker-app');
    expect(names).toContain('monorepo');
  });
});

describe('isValidPreset', () => {
  it('returns true for valid presets', () => {
    expect(isValidPreset('library')).toBe(true);
    expect(isValidPreset('docker-app')).toBe(true);
    expect(isValidPreset('monorepo')).toBe(true);
  });

  it('returns false for invalid presets', () => {
    expect(isValidPreset('invalid')).toBe(false);
    expect(isValidPreset('')).toBe(false);
  });
});
