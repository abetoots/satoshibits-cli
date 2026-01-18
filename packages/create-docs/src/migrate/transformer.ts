/**
 * Content transformations for migration
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  DetectedFile,
  DocumentType,
  MigrationItem,
  MigrationPlan,
  FrontmatterChange,
  IdTransformation,
} from './types.js';
import { extractTitle } from './detector.js';

/**
 * Standard directory mapping for document types
 */
const TYPE_TO_PATH: Record<DocumentType, string> = {
  brd: 'docs/01-strategy/brd.md',
  frd: 'docs/02-requirements/frd.md',
  add: 'docs/03-architecture/add.md',
  adr: 'docs/03-architecture/decisions/', // needs filename
  tsd: 'docs/04-specs/index.md',
  spec: 'docs/04-specs/', // needs filename
  guideline: 'docs/05-guidelines/', // needs filename
  runbook: 'docs/06-operations/runbook.md',
  security: 'docs/06-operations/security.md',
  readme: 'docs/README.md',
  glossary: 'docs/00-meta/glossary.md',
  unknown: 'docs/', // needs filename
};

/**
 * Required frontmatter fields
 */
const REQUIRED_FIELDS = ['id', 'title', 'status', 'version', 'owner', 'last_updated'];

/**
 * Common field mappings from existing frontmatter to standard fields
 */
const FIELD_MAPPINGS: Record<string, string> = {
  date: 'last_updated',
  updated: 'last_updated',
  modified: 'last_updated',
  author: 'owner',
  created_by: 'owner',
  state: 'status',
  doc_type: 'type',
  name: 'title',
};

/**
 * Status value mappings
 */
const STATUS_MAPPINGS: Record<string, string> = {
  draft: 'Draft',
  wip: 'Draft',
  'in progress': 'Draft',
  'in-progress': 'Draft',
  review: 'Review',
  'in review': 'Review',
  pending: 'Review',
  approved: 'Approved',
  final: 'Approved',
  complete: 'Approved',
  completed: 'Approved',
  deprecated: 'Deprecated',
  archived: 'Deprecated',
  obsolete: 'Deprecated',
};

/**
 * Generate target path for a detected file
 */
export function getTargetPath(file: DetectedFile): string {
  const basePath = TYPE_TO_PATH[file.detectedType];
  const filename = path.basename(file.relativePath);

  // if path ends with /, we need to append filename
  if (basePath.endsWith('/')) {
    // for ADRs, keep original filename if it follows pattern
    if (file.detectedType === 'adr') {
      const adrMatch = /^(\d{4})[-_](.+)$/.exec(filename);
      if (adrMatch) {
        return `${basePath}${filename}`;
      }
      // otherwise generate new name
      return `${basePath}${filename}`;
    }

    // for specs/guidelines, use original filename
    return `${basePath}${filename}`;
  }

  return basePath;
}

/**
 * Check if target path already exists
 */
export function checkConflict(cwd: string, targetPath: string): boolean {
  return fs.existsSync(path.join(cwd, targetPath));
}

/**
 * Propose structure migration plan
 */
export function proposeStructureMigration(
  cwd: string,
  files: DetectedFile[],
  includeLoose: string[]
): MigrationPlan {
  const items: MigrationItem[] = [];
  const timestamp = new Date().toISOString();

  for (const file of files) {
    // skip files not included in migration
    if (!file.insideDocs && !includeLoose.includes(file.relativePath)) {
      continue;
    }

    // root README stays in place
    if (file.relativePath.toLowerCase() === 'readme.md') {
      continue;
    }

    const targetPath = getTargetPath(file);

    // skip if already in correct location
    if (file.relativePath === targetPath) {
      continue;
    }

    const hasConflict = checkConflict(cwd, targetPath);

    items.push({
      source: file,
      targetPath,
      action: 'move',
      hasConflict,
    });
  }

  return {
    timestamp,
    tier: 'structure',
    items,
    summary: {
      totalFiles: files.length,
      filesToMove: items.filter((i) => i.action === 'move').length,
      filesToSkip: items.filter((i) => i.action === 'skip').length,
      conflicts: items.filter((i) => i.hasConflict).length,
      frontmatterChanges: 0,
      idTransformations: 0,
    },
  };
}

/**
 * Execute structure migration
 */
export function executeStructureMigration(
  cwd: string,
  plan: MigrationPlan
): Map<string, string> {
  const fileMapping = new Map<string, string>();

  for (const item of plan.items) {
    if (item.action === 'skip') {
      continue;
    }

    if (item.hasConflict && item.conflictResolution === 'skip') {
      continue;
    }

    let targetPath = item.targetPath;

    // handle conflict resolution
    if (item.hasConflict && item.conflictResolution === 'rename') {
      const ext = path.extname(targetPath);
      const base = path.basename(targetPath, ext);
      const dir = path.dirname(targetPath);

      // find a unique filename to avoid overwriting existing -migrated files
      let suffix = 0;
      let candidatePath = path.join(dir, `${base}-migrated${ext}`);
      while (fs.existsSync(path.join(cwd, candidatePath))) {
        suffix++;
        candidatePath = path.join(dir, `${base}-migrated-${suffix}${ext}`);
      }
      targetPath = candidatePath;
    }

    const sourcePath = path.join(cwd, item.source.relativePath);
    const destPath = path.join(cwd, targetPath);

    // ensure target directory exists
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    // move file
    fs.renameSync(sourcePath, destPath);

    fileMapping.set(item.source.relativePath, targetPath);
  }

  return fileMapping;
}

/**
 * Analyze frontmatter changes needed for a file
 */
export function analyzeFrontmatterChanges(
  file: DetectedFile,
  defaultOwner: string
): FrontmatterChange[] {
  const changes: FrontmatterChange[] = [];
  const existing = file.frontmatter ?? {};

  // map existing fields to standard names
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    const standardKey = FIELD_MAPPINGS[key.toLowerCase()] ?? key;
    mapped[standardKey] = value;
  }

  // check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!mapped[field]) {
      let newValue: unknown;

      switch (field) {
        case 'id':
          newValue = generateDocId(file.detectedType);
          break;
        case 'title':
          newValue = extractTitle(file.content) ?? path.basename(file.relativePath, '.md');
          break;
        case 'status':
          newValue = 'Draft';
          break;
        case 'version':
          newValue = '1.0.0';
          break;
        case 'owner':
          newValue = defaultOwner;
          break;
        case 'last_updated':
          newValue = new Date().toISOString().split('T')[0];
          break;
        default:
          newValue = '';
      }

      changes.push({
        field,
        oldValue: null,
        newValue,
        action: 'add',
      });
    } else if (field === 'status') {
      // normalize status value
      const statusValue = mapped[field];
      const statusString = typeof statusValue === 'string' ? statusValue : '';
      const normalizedStatus = normalizeStatus(statusString);
      if (normalizedStatus !== statusValue) {
        changes.push({
          field,
          oldValue: mapped[field],
          newValue: normalizedStatus,
          action: 'update',
        });
      }
    }
  }

  return changes;
}

/**
 * Generate a document ID
 */
function generateDocId(type: DocumentType): string {
  const prefix = type.toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}`;
}

/**
 * Normalize status value to standard
 */
function normalizeStatus(status: string): string {
  const normalized = STATUS_MAPPINGS[status.toLowerCase()];
  return normalized ?? 'Draft';
}

/**
 * Propose frontmatter migration plan
 */
export function proposeFrontmatterMigration(
  _cwd: string,
  files: DetectedFile[],
  defaultOwner: string
): MigrationPlan {
  const items: MigrationItem[] = [];
  const timestamp = new Date().toISOString();

  for (const file of files) {
    // only process files inside docs/
    if (!file.insideDocs) {
      continue;
    }

    const changes = analyzeFrontmatterChanges(file, defaultOwner);

    if (changes.length > 0) {
      items.push({
        source: file,
        targetPath: file.relativePath,
        action: changes.some((c) => c.action === 'add')
          ? 'add-frontmatter'
          : 'update-frontmatter',
        hasConflict: false,
        frontmatterChanges: changes,
      });
    }
  }

  return {
    timestamp,
    tier: 'frontmatter',
    items,
    summary: {
      totalFiles: files.length,
      filesToMove: 0,
      filesToSkip: 0,
      conflicts: 0,
      frontmatterChanges: items.reduce(
        (sum, i) => sum + (i.frontmatterChanges?.length ?? 0),
        0
      ),
      idTransformations: 0,
    },
  };
}

/**
 * Execute frontmatter migration
 */
export function executeFrontmatterMigration(
  cwd: string,
  plan: MigrationPlan,
  fileMapping?: Map<string, string>
): void {
  for (const item of plan.items) {
    if (!item.frontmatterChanges || item.frontmatterChanges.length === 0) {
      continue;
    }

    // resolve actual file path - use new location if file was moved
    const originalPath = item.source.relativePath;
    const actualPath = fileMapping?.get(originalPath) ?? originalPath;
    const filePath = path.join(cwd, actualPath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data: existingFrontmatter, content: body } = matter(content);

    // apply changes
    const newFrontmatter = { ...existingFrontmatter };
    for (const change of item.frontmatterChanges) {
      if (change.action === 'remove') {
        delete newFrontmatter[change.field];
      } else {
        newFrontmatter[change.field] = change.newValue;
      }
    }

    // rebuild file with new frontmatter
    const newContent = matter.stringify(body, newFrontmatter);
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }
}

/**
 * Analyze requirement ID transformations needed
 */
export function analyzeIdTransformations(
  content: string,
  existingIds: string[]
): IdTransformation[] {
  const transformations: IdTransformation[] = [];
  const idMapping = new Map<string, string>();

  // categorize existing IDs
  for (const id of existingIds) {
    // skip if already in standard format
    if (/^(FR|NFR|BR|AD|TS)-[A-Z]+-\d{3}$/.test(id)) {
      continue;
    }

    // determine new ID format
    let prefix = 'FR';

    if (/^NFR/i.test(id)) {
      prefix = 'NFR';
    } else if (/^BR/i.test(id)) {
      prefix = 'BR';
    }

    // extract number
    const numMatch = /\d+/.exec(id);
    const num = numMatch ? numMatch[0].padStart(3, '0') : '001';

    const newId = `${prefix}-CORE-${num}`;
    idMapping.set(id, newId);
  }

  // count occurrences and create transformations
  for (const [oldId, newId] of idMapping) {
    const regex = new RegExp(oldId.replace(/[-_]/g, '[-_]?'), 'g');
    const matches = content.match(regex) ?? [];

    if (matches.length > 0) {
      transformations.push({
        oldId,
        newId,
        occurrences: matches.length,
      });
    }
  }

  return transformations;
}

/**
 * Update cross-references after structure migration
 *
 * @param content - File content with links to update
 * @param pathMapping - Map of oldPath → newPath for moved files
 * @param originalFilePath - The file's ORIGINAL path (before migration)
 * @param newFilePath - The file's NEW path (after migration)
 */
export function updateCrossReferences(
  content: string,
  pathMapping: Map<string, string>,
  originalFilePath: string,
  newFilePath: string
): string {
  let updatedContent = content;

  // find all markdown links
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const text = match[1];
    const linkPath = match[2];

    // skip if capture groups are missing (shouldn't happen with this pattern)
    if (!fullMatch || !text || !linkPath) {
      continue;
    }

    // skip external links
    if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
      continue;
    }

    // resolve the link relative to the ORIGINAL file location
    const originalDir = path.dirname(originalFilePath);
    const linkTarget = linkPath.split('#')[0] ?? '';
    const resolvedOldPath = path.normalize(path.join(originalDir, linkTarget));

    // check if this target was moved
    for (const [oldPath, newPath] of pathMapping) {
      if (resolvedOldPath === oldPath || resolvedOldPath.endsWith(oldPath)) {
        // calculate new relative path from the NEW file location
        const newDir = path.dirname(newFilePath);
        // normalize to forward slashes for markdown compatibility (Windows fix)
        const newRelativePath = path.relative(newDir, newPath).split(path.sep).join('/');
        const anchor = linkPath.includes('#') ? (linkPath.split('#')[1] ?? '') : '';
        const newLink = anchor ? `${newRelativePath}#${anchor}` : newRelativePath;

        updatedContent = updatedContent.replace(
          fullMatch,
          `[${text}](${newLink})`
        );
        break;
      }
    }
  }

  return updatedContent;
}
