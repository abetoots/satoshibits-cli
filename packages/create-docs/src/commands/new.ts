/**
 * new command - generates new documents from templates
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  loadConfig,
  getNextAdrNumber,
  incrementAdrCounter,
  getDocsPath,
} from '../config/manager.js';
import { newDocQuestions } from '../prompts/questions.js';
import {
  renderTemplate,
  createTemplateContext,
  slugify,
} from '../templates/renderer.js';

type NewDocType = 'adr' | 'spec' | 'guideline' | 'basic';

interface NewOptions {
  type: NewDocType;
  name?: string;
}

// document type configurations
const DOC_TYPE_CONFIG: Record<NewDocType, {
  template: string;
  directory: string;
  filenamePrefix?: (counter?: number) => string;
}> = {
  adr: {
    template: 'adr',
    directory: '03-architecture/decisions',
    filenamePrefix: (counter) => `${String(counter).padStart(4, '0')}-`,
  },
  spec: {
    template: 'specs/generic',
    directory: '04-specs',
  },
  guideline: {
    template: 'guidelines/generic',
    directory: '05-guidelines',
  },
  basic: {
    template: 'basic',
    directory: '',
  },
};

export async function newCommand(options: NewOptions): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig(cwd);

  if (!config) {
    console.log(chalk.red('Error: No .create-docs.json found.'));
    console.log(chalk.yellow('Run `create-docs init` first to set up your documentation.'));
    process.exit(1);
  }

  const { type, name } = options;
  let title = name;

  // prompt for title if not provided
  if (!title) {
    const answers = await inquirer.prompt(newDocQuestions);
    title = answers.title;
  }

  const typeConfig = DOC_TYPE_CONFIG[type];
  if (!typeConfig) {
    console.log(chalk.red(`Error: Unknown document type: ${type}`));
    console.log(chalk.yellow('Valid types: adr, spec, guideline, basic'));
    process.exit(1);
  }

  // generate filename
  const slug = slugify(title);
  let filename: string;
  let adrNumber: string | undefined;

  if (type === 'adr') {
    // get next number without incrementing yet
    adrNumber = String(getNextAdrNumber(cwd)).padStart(4, '0');
    filename = `${adrNumber}-${slug}.md`;
  } else {
    filename = `${slug}.md`;
  }

  // determine output path
  const docsPath = getDocsPath(cwd);
  const outputDir = path.join(docsPath, typeConfig.directory);
  const outputPath = path.join(outputDir, filename);

  // ensure directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // check if file exists
  if (fs.existsSync(outputPath)) {
    console.log(chalk.yellow(`Warning: File already exists: ${outputPath}`));
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Overwrite existing file?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.gray('Aborted.'));
      process.exit(0);
    }
  }

  // render template
  const context = createTemplateContext(
    config.projectName,
    title,
    type,
    config.owner,
    config.variance,
    { adrNumber }
  );

  const content = renderTemplate(typeConfig.template, context);

  // write file
  fs.writeFileSync(outputPath, content, 'utf-8');

  // only increment ADR counter after successful file write
  if (type === 'adr') {
    incrementAdrCounter(cwd);
  }

  const relativePath = path.relative(cwd, outputPath);
  console.log(chalk.green(`✓ Created: ${relativePath}`));

  // show helpful info for ADRs
  if (type === 'adr') {
    console.log(chalk.blue(`\nADR #${adrNumber} created.`));
    console.log(chalk.gray('Remember to link this ADR in your ADD when relevant.'));
  }
}
