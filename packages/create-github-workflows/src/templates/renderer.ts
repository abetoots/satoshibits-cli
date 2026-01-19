/**
 * Template rendering with Handlebars and YAML validation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import * as yaml from 'yaml';
import type { TemplateContext, DeployEnvironment } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// templates directory is at package root (not in dist)
const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', 'templates');

/**
 * registers custom handlebars helpers
 */
function registerHelpers(): void {
  // equality helper
  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

  // not equal helper
  Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);

  // or helper
  Handlebars.registerHelper('or', (...args: unknown[]) => {
    // last argument is the handlebars options object
    const values = args.slice(0, -1);
    return values.some((v) => Boolean(v));
  });

  // and helper
  Handlebars.registerHelper('and', (...args: unknown[]) => {
    const values = args.slice(0, -1);
    return values.every((v) => Boolean(v));
  });

  // includes helper for arrays
  Handlebars.registerHelper('includes', (arr: unknown[], value: unknown) => {
    if (!Array.isArray(arr)) return false;
    return arr.includes(value);
  });

  // lowercase helper
  Handlebars.registerHelper('lowercase', (str: string) => {
    return str?.toLowerCase() ?? '';
  });

  // install command helper based on package manager
  Handlebars.registerHelper('installCmd', (packageManager: string) => {
    switch (packageManager) {
      case 'pnpm':
        return 'pnpm install --frozen-lockfile';
      case 'yarn':
        return 'yarn install --frozen-lockfile';
      case 'bun':
        return 'bun install --frozen-lockfile';
      default:
        return 'npm ci';
    }
  });

  // run command helper based on package manager
  Handlebars.registerHelper('runCmd', (packageManager: string) => {
    switch (packageManager) {
      case 'pnpm':
        return 'pnpm';
      case 'yarn':
        return 'yarn';
      case 'bun':
        return 'bun run';
      default:
        return 'npm run';
    }
  });

  // exec command helper based on package manager
  Handlebars.registerHelper('execCmd', (packageManager: string) => {
    switch (packageManager) {
      case 'pnpm':
        return 'pnpm exec';
      case 'yarn':
        return 'yarn';
      case 'bun':
        return 'bunx';
      default:
        return 'npx';
    }
  });

  // filter command helper based on package manager
  Handlebars.registerHelper('filterCmd', (packageManager: string, filter: string) => {
    switch (packageManager) {
      case 'pnpm':
        return `pnpm --filter ${filter}`;
      case 'yarn':
        return `yarn workspace ${filter}`;
      case 'bun':
        return `bun --filter ${filter}`;
      default:
        return `npm --workspace ${filter}`;
    }
  });

  // get platform config for a specific environment
  // pass deployEnvironments explicitly for stable context
  Handlebars.registerHelper(
    'getPlatformConfig',
    (deployEnvs: DeployEnvironment[], envName: string) => {
      if (!Array.isArray(deployEnvs)) return null;
      return deployEnvs.find((e: DeployEnvironment) => e.name === envName) ?? null;
    }
  );
}

// register helpers on module load
registerHelpers();

/**
 * loads and compiles a template file
 */
export function loadTemplate(templatePath: string): HandlebarsTemplateDelegate {
  const fullPath = path.join(TEMPLATES_DIR, templatePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const templateSource = fs.readFileSync(fullPath, 'utf-8');
  return Handlebars.compile(templateSource);
}

/**
 * renders a template with the given context
 */
export function renderTemplate(templatePath: string, context: TemplateContext): string {
  const template = loadTemplate(templatePath);
  return template(context);
}

/**
 * validates that rendered content is valid YAML
 * @throws Error if YAML is invalid
 */
export function validateYaml(content: string, templateName: string): void {
  try {
    yaml.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid YAML generated from template ${templateName}: ${message}`);
  }
}

/**
 * renders a template and validates the output YAML
 */
export function renderAndValidate(templatePath: string, context: TemplateContext): string {
  const content = renderTemplate(templatePath, context);
  validateYaml(content, templatePath);
  return content;
}

/**
 * creates a template context from workflow config
 */
export function createTemplateContext(
  projectName: string,
  packageManager: string,
  nodeVersion: string,
  isMonorepo: boolean,
  additionalContext: Record<string, unknown> = {}
): TemplateContext {
  return {
    projectName,
    packageManager: packageManager as TemplateContext['packageManager'],
    nodeVersion,
    isMonorepo,
    docker: null,
    deployEnvironments: [],
    releaseStrategy: 'release-please',
    npm: null,
    ...additionalContext,
  };
}
