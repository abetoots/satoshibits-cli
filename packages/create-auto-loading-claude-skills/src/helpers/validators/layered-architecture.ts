/**
 * layeredArchitecture validator
 *
 * Validates that code follows layered architecture patterns:
 * - Controllers should delegate to services, not directly access data layer
 * - Services should not contain UI logic
 * - Presentation layer should not directly access data layer
 */

import { createValidator } from '../primitives/create-validator.js';

interface LayerViolation {
  type: 'controller-data' | 'service-ui' | 'component-data';
  file: string;
  description: string;
}

export const layeredArchitecture = createValidator({
  name: 'layered-architecture',
  description: 'Validates layered architecture patterns',

  validate: ({ session, ui }) => {
    const modifiedFiles = session.getModifiedFiles();

    // filter out node_modules, dist, and non-code files
    const codeFiles = modifiedFiles.filter(modFile => {
      const normalized = modFile.path.toLowerCase();
      return (
        !normalized.includes('node_modules') &&
        !normalized.includes('/dist/') &&
        !normalized.includes('/.') && // hidden files
        (normalized.endsWith('.ts') ||
          normalized.endsWith('.tsx') ||
          normalized.endsWith('.js') ||
          normalized.endsWith('.jsx'))
      );
    });

    if (codeFiles.length === 0) {
      return; // no code files to check
    }

    const violations: LayerViolation[] = [];

    for (const modFile of codeFiles) {
      // skip files with no content (e.g., deleted files)
      if (!modFile.content) {
        continue;
      }

      // check for violations based on file location
      const normalized = modFile.path.toLowerCase();

      // check: controllers should not import from data/repositories
      if (normalized.includes('/controllers/') || normalized.includes('/api/')) {
        if (hasDataLayerImport(modFile.content)) {
          violations.push({
            type: 'controller-data',
            file: modFile.path,
            description: 'Controller directly accessing data layer'
          });
        }
      }

      // check: services should not have UI logic
      if (normalized.includes('/services/')) {
        if (hasUILogic(modFile.content)) {
          violations.push({
            type: 'service-ui',
            file: modFile.path,
            description: 'Service contains UI logic'
          });
        }
      }

      // check: components should not import from data layer
      if (
        normalized.includes('/components/') ||
        normalized.includes('/pages/') ||
        normalized.includes('/views/')
      ) {
        if (hasDataLayerImport(modFile.content)) {
          violations.push({
            type: 'component-data',
            file: modFile.path,
            description: 'Component directly accessing data layer'
          });
        }
      }
    }

    // add reminders for each violation
    if (violations.length > 0) {
      // controller → service violations
      const controllerViolations = violations.filter(v => v.type === 'controller-data');
      for (const violation of controllerViolations) {
        ui.addReminder({
          message:
            'Controllers should delegate to services, not directly access data layer (repositories, models, database)',
          priority: 'medium',
          file: violation.file
        });
      }

      // service UI logic violations
      const serviceUIViolations = violations.filter(v => v.type === 'service-ui');
      for (const violation of serviceUIViolations) {
        ui.addReminder({
          message:
            'Services should not contain UI logic (React components, JSX, UI frameworks)',
          priority: 'medium',
          file: violation.file
        });
      }

      // component → data layer violations
      const componentViolations = violations.filter(v => v.type === 'component-data');
      for (const violation of componentViolations) {
        ui.addReminder({
          message:
            'Components should not directly access data layer (repositories, models). Use hooks or service layer instead.',
          priority: 'medium',
          file: violation.file
        });
      }
    }
  }
});

/**
 * Check if code imports from data layer
 */
function hasDataLayerImport(content: string): boolean {
  const dataLayerPatterns = [
    /from\s+['"].*\/data\//i,
    /from\s+['"].*\/repositories?\//i,
    /from\s+['"].*\/models?\//i,
    /from\s+['"].*\/database/i,
    /from\s+['"].*\/db['"]/, // e.g. '../data/db'
    /from\s+['"].*repository['"]/, // e.g. '../data/user-repository'
    /import.*Repository.*from/i,
    /import.*Model.*from.*\/data/i
  ];

  return dataLayerPatterns.some(pattern => pattern.test(content));
}

/**
 * Check if code contains UI logic
 */
function hasUILogic(content: string): boolean {
  const uiPatterns = [
    /import.*from\s+['"]react['"]/i,
    /import.*from\s+['"]@?vue['"]/i,
    /import.*from\s+['"]@angular/i,
    /<[A-Z]\w+[\s>]/, // JSX component tags like <UserCard />
    /React\.createElement/,
    /return\s*\(?\s*<\w+/, // return (<div> or return <div>
    /function.*\(\).*return.*<[a-z]+/ // function component returning JSX
  ];

  return uiPatterns.some(pattern => pattern.test(content));
}
