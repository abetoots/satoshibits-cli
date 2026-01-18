/**
 * lint command - validates documentation integrity
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import chalk from 'chalk';
import { loadConfig, getDocsPath } from '../config/manager.js';
import type { LintResult, LintError, LintWarning, DocumentStatus } from '../types.js';

const VALID_STATUSES: DocumentStatus[] = ['Draft', 'Review', 'Approved', 'Deprecated'];
const REQUIRED_FIELDS = ['title', 'status', 'version', 'owner', 'last_updated'];
const REQ_ID_PATTERN = /\b(FR|NFR|BR|AD|TS)-[A-Z]+-\d{3}\b/g;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const STALE_DAYS = 180; // 6 months

export async function lintCommand(): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig(cwd);

  if (!config) {
    console.log(chalk.red('Error: No .create-docs.json found.'));
    console.log(chalk.yellow('Run `create-docs init` first.'));
    process.exit(1);
  }

  const docsPath = getDocsPath(cwd);

  if (!fs.existsSync(docsPath)) {
    console.log(chalk.red('Error: docs/ directory not found.'));
    process.exit(1);
  }

  console.log(chalk.blue('Linting documentation...\n'));

  // find all markdown files
  const files = await glob('**/*.md', { cwd: docsPath });
  const results: LintResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  // collect all requirement IDs from FRD for cross-reference validation
  const definedReqIds = collectDefinedReqIds(docsPath);

  for (const file of files) {
    const filePath = path.join(docsPath, file);
    const result = lintFile(filePath, file, docsPath, definedReqIds);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // output results
  for (const result of results) {
    if (result.errors.length === 0 && result.warnings.length === 0) {
      continue;
    }

    console.log(chalk.white.bold(`docs/${result.file}`));

    for (const error of result.errors) {
      console.log(chalk.red(`  ✗ ERROR: ${error.message}`));
    }

    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  ⚠ WARNING: ${warning.message}`));
    }

    console.log('');
  }

  // summary
  console.log(chalk.white.bold('Summary'));
  console.log(`  Files checked: ${files.length}`);

  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(chalk.green('  ✓ No issues found'));
    process.exit(0);
  }

  if (totalErrors > 0) {
    console.log(chalk.red(`  ✗ Errors: ${totalErrors}`));
  }
  if (totalWarnings > 0) {
    console.log(chalk.yellow(`  ⚠ Warnings: ${totalWarnings}`));
  }

  // exit with error code if there are errors
  if (totalErrors > 0) {
    process.exit(1);
  }
}

function lintFile(
  filePath: string,
  relativePath: string,
  _docsPath: string,
  definedReqIds: Set<string>
): LintResult {
  const errors: LintError[] = [];
  const warnings: LintWarning[] = [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(content);

  // skip files without frontmatter (like README at root)
  if (Object.keys(frontmatter).length === 0) {
    return { file: relativePath, errors, warnings };
  }

  // check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!frontmatter[field]) {
      errors.push({
        type: 'missing-field',
        message: `Missing required field: ${field}`,
        field,
      });
    }
  }

  // validate status value
  const status = frontmatter.status as string | undefined;
  if (status && !VALID_STATUSES.includes(status as DocumentStatus)) {
    errors.push({
      type: 'invalid-value',
      message: `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      field: 'status',
    });
  }

  // check for stale documents
  const lastUpdatedValue = frontmatter.last_updated as string | undefined;
  if (lastUpdatedValue) {
    const lastUpdated = new Date(lastUpdatedValue);
    const daysSinceUpdate = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceUpdate > STALE_DAYS && status !== 'Deprecated') {
      warnings.push({
        type: 'stale-document',
        message: `Document not updated in ${daysSinceUpdate} days. Consider reviewing.`,
      });
    }
  }

  // check for missing reviewers on non-draft docs
  const reviewers = frontmatter.reviewers as string[] | undefined;
  if (status !== 'Draft' && !reviewers?.length) {
    warnings.push({
      type: 'missing-reviewer',
      message: 'Non-draft document has no reviewers listed.',
    });
  }

  // validate internal links
  const links = [...body.matchAll(LINK_PATTERN)];
  for (const match of links) {
    const linkPath = match[2];
    // skip if capture group is missing (shouldn't happen with this pattern)
    if (!linkPath) {
      continue;
    }

    // skip external links
    if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
      continue;
    }

    // resolve relative links
    const linkDir = path.dirname(filePath);
    const resolvedPath = path.resolve(linkDir, linkPath.split('#')[0] ?? '');

    if (!fs.existsSync(resolvedPath)) {
      errors.push({
        type: 'broken-link',
        message: `Broken link: ${linkPath}`,
      });
    }
  }

  // validate requirement ID references (only for non-FRD files)
  if (!relativePath.includes('frd.md')) {
    const referencedReqIds = body.match(REQ_ID_PATTERN) ?? [];
    for (const reqId of referencedReqIds) {
      if (!definedReqIds.has(reqId)) {
        warnings.push({
          type: 'orphan-req',
          message: `Referenced requirement ID "${reqId}" not found in FRD.`,
        });
      }
    }
  }

  return { file: relativePath, errors, warnings };
}

function collectDefinedReqIds(docsPath: string): Set<string> {
  const reqIds = new Set<string>();

  // look for FRD file
  const frdPath = path.join(docsPath, '02-requirements', 'frd.md');
  if (!fs.existsSync(frdPath)) {
    return reqIds;
  }

  const content = fs.readFileSync(frdPath, 'utf-8');
  const matches = content.match(REQ_ID_PATTERN) ?? [];

  for (const match of matches) {
    reqIds.add(match);
  }

  return reqIds;
}
