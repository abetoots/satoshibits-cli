/**
 * Tests for new workflow template rendering (security, maintenance, docs)
 */

import { describe, it, expect } from 'vitest';
import { renderAndValidate, createTemplateContext } from './renderer.js';

describe('security templates', () => {
  it('renders codeql template as valid YAML', () => {
    const context = createTemplateContext('test-project', 'npm', '20', false);
    const result = renderAndValidate('security/codeql.yml.hbs', context);

    expect(result).toContain('name: CodeQL Analysis');
    expect(result).toContain('javascript-typescript');
    expect(result).toContain('security-events: write');
    expect(result).toContain('github/codeql-action/init@v3');
    expect(result).toContain('github/codeql-action/analyze@v3');
  });

  it('renders dependency-audit with npm', () => {
    const context = createTemplateContext('test-project', 'npm', '20', false);
    const result = renderAndValidate('security/dependency-audit.yml.hbs', context);

    expect(result).toContain('npm ci');
    expect(result).toContain('npm audit --audit-level=high');
    expect(result).not.toContain('pnpm');
  });

  it('renders dependency-audit with pnpm', () => {
    const context = createTemplateContext('test-project', 'pnpm', '20', false);
    const result = renderAndValidate('security/dependency-audit.yml.hbs', context);

    expect(result).toContain('pnpm install --frozen-lockfile');
    expect(result).toContain('pnpm audit --audit-level=high');
    expect(result).toContain('Setup pnpm');
    expect(result).toContain('cache: "pnpm"');
  });

  it('renders dependency-audit with bun (generates lockfile then npm audit)', () => {
    const context = createTemplateContext('test-project', 'bun', '20', false);
    const result = renderAndValidate('security/dependency-audit.yml.hbs', context);

    expect(result).toContain('Setup Bun');
    expect(result).toContain('bun install --frozen-lockfile');
    expect(result).toContain('npm install --package-lock-only && npm audit --audit-level=high');
  });
});

describe('maintenance templates', () => {
  it('renders dependabot template as valid YAML', () => {
    const context = createTemplateContext('test-project', 'npm', '20', false);
    const result = renderAndValidate('maintenance/dependabot.yml.hbs', context);

    expect(result).toContain('version: 2');
    expect(result).toContain('package-ecosystem: "npm"');
    expect(result).toContain('package-ecosystem: "github-actions"');
  });

  it('renders stale template as valid YAML', () => {
    const context = createTemplateContext('test-project', 'npm', '20', false);
    const result = renderAndValidate('maintenance/stale.yml.hbs', context);

    expect(result).toContain('name: Stale Issues and PRs');
    expect(result).toContain('actions/stale@v9');
    expect(result).toContain('days-before-stale: 60');
    expect(result).toContain('days-before-close: 7');
    expect(result).toContain('exempt-issue-labels: "pinned,security,bug"');
  });
});

describe('docs templates', () => {
  it('renders deploy-docs with explicit docs config', () => {
    const context = createTemplateContext('test-project', 'pnpm', '20', false, {
      docs: { buildScript: 'docs:build', outputDir: './docs/.vitepress/dist' },
    });
    const result = renderAndValidate('docs/deploy-docs.yml.hbs', context);

    expect(result).toContain('docs:build');
    expect(result).toContain('./docs/.vitepress/dist');
    expect(result).not.toContain('build:docs');
  });

  it('renders deploy-docs with fallback defaults when no docs config', () => {
    const context = createTemplateContext('test-project', 'npm', '20', false);
    const result = renderAndValidate('docs/deploy-docs.yml.hbs', context);

    expect(result).toContain('build:docs');
    expect(result).toContain('./dist');
    expect(result).toContain('deploy-pages@v4');
    expect(result).toContain('upload-pages-artifact@v3');
  });

  it('renders deploy-docs with bun setup', () => {
    const context = createTemplateContext('test-project', 'bun', '20', false);
    const result = renderAndValidate('docs/deploy-docs.yml.hbs', context);

    expect(result).toContain('Setup Bun');
    expect(result).toContain('oven-sh/setup-bun@v2');
  });
});
