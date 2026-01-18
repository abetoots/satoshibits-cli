/**
 * init command - scaffolds docs directory and creates config
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  configExists,
  docsExist,
  saveConfig,
  createDefaultConfig,
  getDocsPath,
} from '../config/manager.js';
import {
  initQuestions,
  answersToVariance,
  QuestionNames,
  type InitAnswers,
} from '../prompts/questions.js';
import { renderTemplate, createTemplateContext } from '../templates/renderer.js';
import type { ProjectProfile, VarianceConfig } from '../types.js';

interface InitOptions {
  profile?: ProjectProfile;
  yes?: boolean;
  force?: boolean;
}

// type for question items that may have a name property (questions have name, separators don't)
interface QuestionItem { name?: string; [key: string]: unknown }

// directory structure to create
const DOCS_STRUCTURE = [
  '00-meta',
  '01-strategy',
  '02-requirements',
  '03-architecture',
  '03-architecture/decisions',
  '04-specs',
  '05-guidelines',
  '06-operations',
  'archive',
];

// mapping of spec file names to their question names (using constants for type safety)
const SPEC_TO_QUESTIONS: Record<string, string[]> = {
  'database': [QuestionNames.databaseEngine, QuestionNames.ormStrategy],
  'api': [QuestionNames.hasApi, QuestionNames.apiStyle, QuestionNames.apiVersioning],
  'authentication': [QuestionNames.identityProvider, QuestionNames.authStrategy],
  'background-jobs': [QuestionNames.hasAsyncProcessing, QuestionNames.messagingPattern, QuestionNames.messageBroker],
};

/**
 * detects which spec files already exist in the docs directory
 */
function detectExistingSpecs(docsPath: string): Set<string> {
  const existingSpecs = new Set<string>();
  const specsDir = path.join(docsPath, '04-specs');

  if (!fs.existsSync(specsDir)) {
    return existingSpecs;
  }

  for (const specName of Object.keys(SPEC_TO_QUESTIONS)) {
    const specPath = path.join(specsDir, `${specName}.md`);
    if (fs.existsSync(specPath)) {
      existingSpecs.add(specName);
    }
  }

  return existingSpecs;
}

/**
 * infers variance config values from existing spec files
 */
function inferVarianceFromExistingSpecs(existingSpecs: Set<string>): Partial<VarianceConfig> {
  return {
    hasDatabase: existingSpecs.has('database'),
    hasApi: existingSpecs.has('api') || existingSpecs.has('authentication'),
    hasAsyncProcessing: existingSpecs.has('background-jobs'),
  };
}

/**
 * filters out questions that correspond to existing spec files
 */
function filterQuestionsForExistingSpecs(
  questions: QuestionItem[],
  existingSpecs: Set<string>
): QuestionItem[] {
  // collect all question names to skip based on existing specs
  const questionsToSkip = new Set<string>();

  for (const specName of existingSpecs) {
    const questionNames = SPEC_TO_QUESTIONS[specName];
    if (questionNames) {
      for (const qName of questionNames) {
        questionsToSkip.add(qName);
      }
    }
  }

  if (questionsToSkip.size === 0) {
    return questions;
  }

  // filter out questions by name (separators have no name, so they pass through)
  return questions.filter((q) => !q.name || !questionsToSkip.has(q.name));
}

// core documents to generate for each profile
const CORE_DOCUMENTS: Record<ProjectProfile, string[]> = {
  greenfield: [
    'readme',
    'glossary',
    'brd',
    'frd',
    'add',
    'tsd-index',
  ],
  migration: [
    'readme',
    'glossary',
    'frd',
    'add',
    'tsd-index',
  ],
  library: [
    'readme',
    'glossary',
    'add',
    'tsd-index',
  ],
};

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();

  // check for existing config/docs
  const hasExistingConfig = configExists(cwd);
  const hasExistingDocs = docsExist(cwd);

  if (!options.force && hasExistingConfig && hasExistingDocs) {
    console.log(chalk.yellow('docs/ and .create-docs.json already exist.'));
    console.log(chalk.gray('Running in incremental mode - will only create missing documents.'));
    console.log(chalk.gray('Use --force to regenerate all documents.\n'));
  } else if (hasExistingDocs && !hasExistingConfig) {
    console.log(chalk.blue('Found existing docs/ directory without config.'));
    console.log(chalk.gray('Will create config and fill in missing documents.\n'));
  }

  // detect existing spec files to skip related prompts
  const docsPath = getDocsPath(cwd);
  const existingSpecs = detectExistingSpecs(docsPath);
  const inferredVariance = inferVarianceFromExistingSpecs(existingSpecs);

  // notify user about skipped prompts
  if (!options.force && existingSpecs.size > 0) {
    console.log(chalk.blue(`Detected existing specs: ${[...existingSpecs].join(', ')}`));
    console.log(chalk.gray('Skipping related prompts. Use --force to reconfigure.\n'));
  }

  let answers: InitAnswers;

  if (options.yes) {
    // use defaults for quick setup with expert-recommended values
    answers = {
      projectName: path.basename(cwd),
      profile: options.profile ?? 'greenfield',
      owner: '@lead-engineer',
      // tier 1 required fields
      hasApi: true,
      hasAsyncProcessing: false,
      isRegulated: false,
      cloudProvider: 'aws',
      gitStrategy: 'trunk-based',
      databaseEngine: 'postgres',
      identityProvider: 'auth0',
      // tier 1 conditional defaults (triggered by above choices)
      ormStrategy: 'prisma',
      apiStyle: 'rest',
      apiVersioning: 'url-path',
      authStrategy: 'jwt',
      // tier 2 conditional defaults
      cacheLayer: 'redis',
      hasFrontend: false,
    };
    console.log(chalk.blue('Using default configuration...'));
  } else if (options.profile) {
    // prompt with pre-selected profile
    let questionsArray = (initQuestions as QuestionItem[]).filter((q) => q.name !== 'profile');
    // filter out questions for existing specs (unless --force)
    if (!options.force && existingSpecs.size > 0) {
      questionsArray = filterQuestionsForExistingSpecs(questionsArray, existingSpecs);
    }
    const partialAnswers = await inquirer.prompt<Omit<InitAnswers, 'profile'>>(questionsArray);
    answers = { ...partialAnswers, profile: options.profile };
  } else {
    // full interactive mode
    // filter out questions for existing specs (unless --force)
    const questionsToUse = !options.force && existingSpecs.size > 0
      ? filterQuestionsForExistingSpecs(initQuestions as QuestionItem[], existingSpecs)
      : initQuestions;
    answers = await inquirer.prompt(questionsToUse);
  }

  // merge inferred variance from existing specs with prompted answers
  const baseVariance = answersToVariance(answers);
  const variance: VarianceConfig = {
    ...baseVariance,
    // inferred values take precedence only when true (existing specs mean feature exists)
    // this ensures we don't override user's "yes" answers with "false" from missing specs
    ...(inferredVariance.hasDatabase && { hasDatabase: true }),
    ...(inferredVariance.hasApi && { hasApi: true }),
    ...(inferredVariance.hasAsyncProcessing && { hasAsyncProcessing: true }),
  };
  const config = createDefaultConfig(
    answers.projectName,
    answers.profile,
    answers.owner,
    variance
  );

  console.log(chalk.blue('\nCreating documentation structure...'));

  // create directory structure (docsPath already defined above)
  for (const dir of DOCS_STRUCTURE) {
    const dirPath = path.join(docsPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(chalk.gray(`  Created: docs/${dir}/`));
    }
  }

  // track stats for summary
  let created = 0;
  let skipped = 0;

  // generate core documents
  const coreDocuments = CORE_DOCUMENTS[answers.profile];
  for (const docType of coreDocuments) {
    const result = generateDocument(docType, answers.projectName, answers.owner, variance, docsPath, options.force);
    if (result === 'created') created++;
    else if (result === 'skipped') skipped++;
  }

  // generate conditional documents based on variance
  const conditionalStats = generateConditionalDocuments(variance, answers.projectName, answers.owner, docsPath, options.force);
  created += conditionalStats.created;
  skipped += conditionalStats.skipped;

  // save config (only if missing or forced)
  if (options.force || !hasExistingConfig) {
    saveConfig(config, cwd);
    if (!hasExistingConfig) {
      console.log(chalk.gray('  Created: .create-docs.json'));
    } else {
      console.log(chalk.gray('  Updated: .create-docs.json'));
    }
  } else {
    console.log(chalk.gray('  Skipped: .create-docs.json (exists)'));
  }

  // summary
  if (skipped > 0) {
    console.log(chalk.green(`\n✓ Documentation structure updated!`));
    console.log(chalk.gray(`  ${created} documents created, ${skipped} existing documents preserved.`));
  } else {
    console.log(chalk.green('\n✓ Documentation structure created successfully!'));
  }

  console.log(chalk.blue('\nNext steps:'));
  console.log('  1. Review and customize the generated documents');
  console.log('  2. Use `create-docs new <type> [name]` to add more documents');
  console.log('  3. Use `create-docs status` to view document health');
}

function generateDocument(
  docType: string,
  projectName: string,
  owner: string,
  variance: VarianceConfig,
  docsPath: string,
  force?: boolean
): 'created' | 'skipped' | 'none' {
  const context = createTemplateContext(projectName, getDocTitle(docType), docType, owner, variance);

  let content: string;
  let filePath: string;

  switch (docType) {
    case 'readme':
      content = renderTemplate('readme', context);
      filePath = path.join(docsPath, 'README.md');
      break;
    case 'glossary':
      content = renderTemplate('glossary', context);
      filePath = path.join(docsPath, '00-meta', 'glossary.md');
      break;
    case 'brd':
      content = renderTemplate('brd', context);
      filePath = path.join(docsPath, '01-strategy', 'brd.md');
      break;
    case 'frd':
      content = renderTemplate('frd', context);
      filePath = path.join(docsPath, '02-requirements', 'frd.md');
      break;
    case 'add':
      content = renderTemplate('add', context);
      filePath = path.join(docsPath, '03-architecture', 'add.md');
      break;
    case 'tsd-index':
      content = renderTemplate('tsd-index', context);
      filePath = path.join(docsPath, '04-specs', 'index.md');
      break;
    default:
      return 'none';
  }

  // skip if file exists and not forcing
  if (!force && fs.existsSync(filePath)) {
    console.log(chalk.gray(`  Skipped: ${path.relative(process.cwd(), filePath)} (exists)`));
    return 'skipped';
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(chalk.gray(`  Created: ${path.relative(process.cwd(), filePath)}`));
  return 'created';
}

function generateConditionalDocuments(
  variance: VarianceConfig,
  projectName: string,
  owner: string,
  docsPath: string,
  force?: boolean
): { created: number; skipped: number } {
  const context = createTemplateContext(projectName, '', '', owner, variance);
  let created = 0;
  let skipped = 0;

  // helper to write file with skip logic
  const writeIfMissing = (filePath: string, content: string): void => {
    if (!force && fs.existsSync(filePath)) {
      console.log(chalk.gray(`  Skipped: ${path.relative(process.cwd(), filePath)} (exists)`));
      skipped++;
      return;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(chalk.gray(`  Created: ${path.relative(process.cwd(), filePath)}`));
    created++;
  };

  // api and authentication specs
  if (variance.hasApi) {
    const apiContext = { ...context, title: 'API Specification', docType: 'spec' };
    writeIfMissing(
      path.join(docsPath, '04-specs', 'api.md'),
      renderTemplate('specs/api', apiContext)
    );

    const authContext = { ...context, title: 'Authentication Specification', docType: 'spec' };
    writeIfMissing(
      path.join(docsPath, '04-specs', 'authentication.md'),
      renderTemplate('specs/authentication', authContext)
    );
  }

  // database spec
  if (variance.hasDatabase) {
    const dbContext = { ...context, title: 'Database Specification', docType: 'spec' };
    writeIfMissing(
      path.join(docsPath, '04-specs', 'database.md'),
      renderTemplate('specs/database', dbContext)
    );
  }

  // background jobs spec
  if (variance.hasAsyncProcessing) {
    const jobsContext = { ...context, title: 'Background Jobs Specification', docType: 'spec' };
    writeIfMissing(
      path.join(docsPath, '04-specs', 'background-jobs.md'),
      renderTemplate('specs/background-jobs', jobsContext)
    );
  }

  // guidelines (always generated)
  const guidelinesDir = path.join(docsPath, '05-guidelines');

  const codingContext = { ...context, title: 'Coding Guidelines', docType: 'guideline' };
  writeIfMissing(
    path.join(guidelinesDir, 'coding.md'),
    renderTemplate('guidelines/coding', codingContext)
  );

  const testingContext = { ...context, title: 'Testing Strategy', docType: 'guideline' };
  writeIfMissing(
    path.join(guidelinesDir, 'testing.md'),
    renderTemplate('guidelines/testing', testingContext)
  );

  const deploymentContext = { ...context, title: 'Deployment Guidelines', docType: 'guideline' };
  writeIfMissing(
    path.join(guidelinesDir, 'deployment.md'),
    renderTemplate('guidelines/deployment', deploymentContext)
  );

  const observabilityContext = { ...context, title: 'Observability Guidelines', docType: 'guideline' };
  writeIfMissing(
    path.join(guidelinesDir, 'observability.md'),
    renderTemplate('guidelines/observability', observabilityContext)
  );

  // regulated industry extras
  if (variance.isRegulated) {
    const changeContext = { ...context, title: 'Change & Risk Management', docType: 'guideline' };
    writeIfMissing(
      path.join(guidelinesDir, 'change-management.md'),
      renderTemplate('guidelines/change-management', changeContext)
    );
  }

  // operations docs
  const opsDir = path.join(docsPath, '06-operations');

  const runbookContext = { ...context, title: 'Operations Runbook', docType: 'operations' };
  writeIfMissing(
    path.join(opsDir, 'runbook.md'),
    renderTemplate('operations/runbook', runbookContext)
  );

  const securityContext = { ...context, title: 'Security Guidelines', docType: 'operations' };
  writeIfMissing(
    path.join(opsDir, 'security.md'),
    renderTemplate('operations/security', securityContext)
  );

  return { created, skipped };
}

function getDocTitle(docType: string): string {
  const titles: Record<string, string> = {
    readme: 'Documentation',
    glossary: 'Glossary',
    brd: 'Business Requirements Document',
    frd: 'Functional Requirements Document',
    add: 'Application Design Document',
    'tsd-index': 'Technical Specifications',
  };
  return titles[docType] ?? docType;
}
