/**
 * handlebars template renderer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import type { TemplateContext } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// templates are in the package root /templates directory
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// register handlebars helpers
Handlebars.registerHelper('uppercase', (str: string) => str?.toUpperCase());
Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase());
Handlebars.registerHelper('capitalize', (str: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});
Handlebars.registerHelper('padNumber', (num: number, width: number) => {
  return String(num).padStart(width, '0');
});

// comparison helpers for decision point conditionals
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
Handlebars.registerHelper('or', (...args: unknown[]) => {
  // last arg is the handlebars options object
  const values = args.slice(0, -1);
  return values.some(Boolean);
});
Handlebars.registerHelper('and', (...args: unknown[]) => {
  const values = args.slice(0, -1);
  return values.every(Boolean);
});

export function getTemplatePath(templateName: string): string {
  return path.join(TEMPLATES_DIR, `${templateName}.md.hbs`);
}

export function templateExists(templateName: string): boolean {
  return fs.existsSync(getTemplatePath(templateName));
}

export function loadTemplate(templateName: string): HandlebarsTemplateDelegate {
  const templatePath = getTemplatePath(templateName);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(templateContent);
}

export function renderTemplate(templateName: string, context: TemplateContext): string {
  const template = loadTemplate(templateName);
  return template(context);
}

export function createTemplateContext(
  projectName: string,
  title: string,
  docType: string,
  owner: string,
  variance: TemplateContext['variance'],
  options?: { adrNumber?: string; specName?: string; audience?: TemplateContext['audience'] }
): TemplateContext {
  // default audience based on document type
  const defaultAudience: TemplateContext['audience'] = ['brd'].includes(docType) ? 'business'
    : ['frd', 'readme', 'glossary'].includes(docType) ? 'all'
    : 'technical';

  return {
    projectName,
    title,
    docType,
    owner,
    currentDate: new Date().toISOString().slice(0, 10),
    variance,
    audience: options?.audience ?? defaultAudience,
    adrNumber: options?.adrNumber,
    specName: options?.specName,
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
