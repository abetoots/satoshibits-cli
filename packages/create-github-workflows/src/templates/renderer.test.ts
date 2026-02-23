/**
 * Tests for template renderer
 */

import { describe, it, expect } from 'vitest';
import { validateYaml, createTemplateContext } from './renderer.js';

describe('validateYaml', () => {
  it('validates correct YAML', () => {
    const validYaml = `
name: Test Workflow
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
`;

    // should not throw
    expect(() => validateYaml(validYaml, 'test.yml')).not.toThrow();
  });

  it('throws on invalid YAML', () => {
    // the yaml parser is lenient, so test with something that will definitely fail
    const invalidYaml = `
foo:
  - item1
 - item2 with bad indent
`;

    expect(() => validateYaml(invalidYaml, 'test.yml')).toThrow();
  });
});

describe('createTemplateContext', () => {
  it('creates context with basic properties', () => {
    const context = createTemplateContext(
      'my-project',
      'pnpm',
      '20',
      false
    );

    expect(context.projectName).toBe('my-project');
    expect(context.packageManager).toBe('pnpm');
    expect(context.nodeVersion).toBe('20');
    expect(context.isMonorepo).toBe(false);
    expect(context.docker).toBeNull();
    expect(context.deployEnvironments).toEqual([]);
    expect(context.releaseStrategy).toBe('release-please');
    expect(context.npm).toBeNull();
    expect(context.docs).toBeNull();
  });

  it('merges additional context', () => {
    const context = createTemplateContext(
      'my-project',
      'pnpm',
      '20',
      true,
      {
        docker: {
          registry: 'ghcr',
          imageName: 'my-image',
          dockerfilePath: './Dockerfile',
          buildTargets: [],
        },
        customProp: 'custom-value',
      }
    );

    expect(context.isMonorepo).toBe(true);
    expect(context.docker).toEqual({
      registry: 'ghcr',
      imageName: 'my-image',
      dockerfilePath: './Dockerfile',
      buildTargets: [],
    });
    expect(context.customProp).toBe('custom-value');
  });
});
