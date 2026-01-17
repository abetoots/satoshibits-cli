/**
 * status command - displays document health table
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import chalk from 'chalk';
import Table from 'cli-table3';
import { loadConfig, getDocsPath } from '../config/manager.js';
import type { StatusEntry, DocumentStatus } from '../types.js';

const STATUS_COLORS: Record<DocumentStatus, (text: string) => string> = {
  Draft: chalk.yellow,
  Review: chalk.blue,
  Approved: chalk.green,
  Deprecated: chalk.gray,
};

export async function statusCommand(): Promise<void> {
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

  console.log(chalk.blue.bold(`\nDocumentation Status: ${config.projectName}\n`));

  // find all markdown files
  const files = await glob('**/*.md', { cwd: docsPath });
  const entries: StatusEntry[] = [];
  const statusCounts: Record<string, number> = {
    Draft: 0,
    Review: 0,
    Approved: 0,
    Deprecated: 0,
    Unknown: 0,
  };

  for (const file of files) {
    const filePath = path.join(docsPath, file);
    const entry = await getStatusEntry(filePath, file);

    if (entry) {
      entries.push(entry);
      statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
    }
  }

  // sort entries by directory then filename
  entries.sort((a, b) => a.document.localeCompare(b.document));

  // create table
  const table = new Table({
    head: [
      chalk.white.bold('Document'),
      chalk.white.bold('Status'),
      chalk.white.bold('Owner'),
      chalk.white.bold('Last Updated'),
      chalk.white.bold('Version'),
    ],
    style: {
      head: [],
      border: [],
    },
  });

  for (const entry of entries) {
    const colorFn = STATUS_COLORS[entry.status] || chalk.white;
    table.push([
      entry.document,
      colorFn(entry.status),
      entry.owner || chalk.gray('(none)'),
      entry.lastUpdated || chalk.gray('(unknown)'),
      entry.version || chalk.gray('(none)'),
    ]);
  }

  console.log(table.toString());

  // summary
  console.log(chalk.white.bold('\nSummary'));
  console.log(`  Total documents: ${entries.length}`);

  if (statusCounts.Draft > 0) {
    console.log(chalk.yellow(`  Draft: ${statusCounts.Draft}`));
  }
  if (statusCounts.Review > 0) {
    console.log(chalk.blue(`  In Review: ${statusCounts.Review}`));
  }
  if (statusCounts.Approved > 0) {
    console.log(chalk.green(`  Approved: ${statusCounts.Approved}`));
  }
  if (statusCounts.Deprecated > 0) {
    console.log(chalk.gray(`  Deprecated: ${statusCounts.Deprecated}`));
  }

  // coverage metrics
  const totalWithFrontmatter = entries.length;
  const approved = statusCounts.Approved || 0;
  const coverage = totalWithFrontmatter > 0
    ? Math.round((approved / totalWithFrontmatter) * 100)
    : 0;

  console.log(`\n  Approval coverage: ${coverage}%`);

  // warnings
  const missingOwner = entries.filter((e) => !e.owner).length;
  const stale = entries.filter((e) => {
    if (!e.lastUpdated) return false;
    const lastUpdated = new Date(e.lastUpdated);
    const daysSince = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 180;
  }).length;

  if (missingOwner > 0) {
    console.log(chalk.yellow(`\n  ⚠ ${missingOwner} document(s) missing owner`));
  }
  if (stale > 0) {
    console.log(chalk.yellow(`  ⚠ ${stale} document(s) not updated in 6+ months`));
  }
}

async function getStatusEntry(filePath: string, relativePath: string): Promise<StatusEntry | null> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter } = matter(content);

  // skip files without frontmatter
  if (Object.keys(frontmatter).length === 0) {
    return null;
  }

  return {
    document: `docs/${relativePath}`,
    status: (frontmatter.status as DocumentStatus) || 'Draft',
    owner: frontmatter.owner || '',
    lastUpdated: frontmatter.last_updated || '',
    version: frontmatter.version || '',
  };
}
