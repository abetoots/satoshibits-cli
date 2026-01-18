/**
 * File detection and classification for migration
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import type { DetectedFile, DocumentType } from './types.js';

/**
 * Files/directories to always skip during migration
 */
const SKIP_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.create-docs-backups/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '*.min.md',
];

/**
 * Files to always skip (not migrate)
 */
const SKIP_FILES = [
  'CHANGELOG.md',
  'LICENSE.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  '.github/**/*.md',
];

/**
 * Heuristics for document type detection
 */
interface ClassificationRule {
  type: DocumentType;
  /** Filename patterns (case-insensitive) */
  filenamePatterns?: RegExp[];
  /** Content patterns to look for */
  contentPatterns?: RegExp[];
  /** Path patterns */
  pathPatterns?: RegExp[];
  /** Base confidence when matched */
  baseConfidence: number;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  // BRD - Business Requirements Document
  {
    type: 'brd',
    filenamePatterns: [/brd/i, /business[-_]?req/i],
    contentPatterns: [
      /##?\s*business\s+objectives?/i,
      /##?\s*success\s+(metrics|criteria)/i,
      /##?\s*stakeholder/i,
    ],
    baseConfidence: 0.8,
  },
  // FRD - Functional Requirements Document
  {
    type: 'frd',
    filenamePatterns: [/frd/i, /functional[-_]?req/i, /requirements?/i, /features?/i],
    contentPatterns: [
      /\bFR-[A-Z]+-\d+/,
      /##?\s*functional\s+requirements?/i,
      /##?\s*acceptance\s+criteria/i,
      /##?\s*user\s+stor(y|ies)/i,
    ],
    baseConfidence: 0.7,
  },
  // ADD - Application Design Document
  {
    type: 'add',
    filenamePatterns: [/add/i, /architecture/i, /design[-_]?doc/i, /system[-_]?design/i],
    contentPatterns: [
      /##?\s*architecture\s+overview/i,
      /##?\s*technology\s+stack/i,
      /##?\s*component\s+design/i,
      /C4Context|C4Container/i,
    ],
    pathPatterns: [/architect/i],
    baseConfidence: 0.8,
  },
  // TSD / Specs
  {
    type: 'tsd',
    filenamePatterns: [/tsd/i, /tech[-_]?spec/i, /technical[-_]?spec/i],
    contentPatterns: [
      /##?\s*technical\s+specification/i,
      /##?\s*implementation\s+details?/i,
    ],
    baseConfidence: 0.7,
  },
  {
    type: 'spec',
    filenamePatterns: [/spec/i, /database/i, /api[-_]?spec/i, /auth/i],
    pathPatterns: [/specs?[/\\]/i],
    contentPatterns: [
      /##?\s*database\s+schema/i,
      /##?\s*api\s+endpoints?/i,
      /##?\s*authentication/i,
    ],
    baseConfidence: 0.6,
  },
  // ADR - Architecture Decision Record
  {
    type: 'adr',
    filenamePatterns: [/^\d{4}[-_]/i, /^adr[-_]/i],
    pathPatterns: [/decisions?[/\\]/i, /adrs?[/\\]/i],
    contentPatterns: [
      /##?\s*status/i,
      /##?\s*context/i,
      /##?\s*decision/i,
      /##?\s*consequences/i,
    ],
    baseConfidence: 0.9,
  },
  // Guidelines
  {
    type: 'guideline',
    filenamePatterns: [/guideline/i, /coding[-_]?standard/i, /style[-_]?guide/i, /testing/i],
    pathPatterns: [/guidelines?[/\\]/i],
    contentPatterns: [
      /##?\s*coding\s+(guidelines?|standards?)/i,
      /##?\s*testing\s+strategy/i,
    ],
    baseConfidence: 0.7,
  },
  // Runbook
  {
    type: 'runbook',
    filenamePatterns: [/runbook/i, /playbook/i, /operations?/i],
    pathPatterns: [/operations?[/\\]/i, /runbooks?[/\\]/i],
    contentPatterns: [
      /##?\s*incident\s+response/i,
      /##?\s*deployment\s+procedure/i,
      /##?\s*troubleshooting/i,
    ],
    baseConfidence: 0.7,
  },
  // Security
  {
    type: 'security',
    filenamePatterns: [/security/i],
    contentPatterns: [
      /##?\s*security\s+(guidelines?|principles?)/i,
      /##?\s*authentication/i,
      /##?\s*authorization/i,
      /zero\s+trust/i,
    ],
    baseConfidence: 0.7,
  },
  // README
  {
    type: 'readme',
    filenamePatterns: [/^readme/i],
    baseConfidence: 0.95,
  },
  // Glossary
  {
    type: 'glossary',
    filenamePatterns: [/glossary/i, /definitions?/i, /terms/i],
    contentPatterns: [/##?\s*glossary/i, /##?\s*definitions?/i],
    baseConfidence: 0.8,
  },
];

/**
 * Scan for all markdown files in the project
 */
export async function scanForDocs(cwd: string): Promise<string[]> {
  const files = await glob('**/*.md', {
    cwd,
    ignore: [...SKIP_PATTERNS, ...SKIP_FILES],
    nodir: true,
  });

  return files;
}

/**
 * Classify a document based on filename and content
 */
export function classifyDocument(
  relativePath: string,
  content: string
): { type: DocumentType; confidence: number } {
  const filename = path.basename(relativePath);
  let bestMatch: { type: DocumentType; confidence: number } = {
    type: 'unknown',
    confidence: 0,
  };

  for (const rule of CLASSIFICATION_RULES) {
    let score = 0;
    let matchCount = 0;

    // check filename patterns
    if (rule.filenamePatterns) {
      for (const pattern of rule.filenamePatterns) {
        if (pattern.test(filename)) {
          score += 0.4;
          matchCount++;
          break;
        }
      }
    }

    // check path patterns
    if (rule.pathPatterns) {
      for (const pattern of rule.pathPatterns) {
        if (pattern.test(relativePath)) {
          score += 0.3;
          matchCount++;
          break;
        }
      }
    }

    // check content patterns
    if (rule.contentPatterns) {
      let contentMatches = 0;
      for (const pattern of rule.contentPatterns) {
        if (pattern.test(content)) {
          contentMatches++;
        }
      }
      if (contentMatches > 0) {
        score += Math.min(0.5, contentMatches * 0.15);
        matchCount++;
      }
    }

    // calculate final confidence
    if (matchCount > 0) {
      const confidence = Math.min(0.95, rule.baseConfidence * (0.5 + score));

      if (confidence > bestMatch.confidence) {
        bestMatch = { type: rule.type, confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Parse existing frontmatter from content
 */
export function detectExistingFrontmatter(
  content: string
): Record<string, unknown> | null {
  try {
    const { data } = matter(content);

    if (Object.keys(data).length === 0) {
      return null;
    }

    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Detect existing requirement ID patterns in content
 */
export function detectRequirementIds(content: string): {
  pattern: RegExp | null;
  ids: string[];
} {
  // common patterns for requirement IDs
  const patterns = [
    /\b(FR|NFR|BR|AD|TS)-[A-Z]+-\d{3}\b/g, // standard: FR-AUTH-001
    /\b(FR|NFR|BR|REQ)-\d{3,4}\b/g, // simple: FR-001, REQ-0001
    /\bREQ[-_]?\d{3,4}\b/gi, // REQ-001, REQ_001, REQ001
    /\bF\d+\.\d+\b/g, // hierarchical: F1.2, F3.1.4
    /\bUS[-_]?\d{3,4}\b/gi, // user story: US-001, US_001
  ];

  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      return {
        pattern,
        ids: [...new Set(matches)], // unique IDs
      };
    }
  }

  return { pattern: null, ids: [] };
}

/**
 * Extract first H1 heading from content
 */
export function extractTitle(content: string): string | null {
  const match = /^#\s+(.+)$/m.exec(content);
  const title = match?.[1];
  return title ? title.trim() : null;
}

/**
 * Full file detection - combines all detection functions
 */
export function detectFile(
  cwd: string,
  relativePath: string
): DetectedFile {
  const absolutePath = path.join(cwd, relativePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const { type, confidence } = classifyDocument(relativePath, content);
  const frontmatter = detectExistingFrontmatter(content);
  const insideDocs =
    relativePath.startsWith('docs/') || relativePath.startsWith('docs\\');

  return {
    relativePath,
    absolutePath,
    insideDocs,
    detectedType: type,
    confidence,
    frontmatter,
    content,
  };
}

/**
 * Scan and detect all files
 */
export async function detectAllFiles(cwd: string): Promise<DetectedFile[]> {
  const files = await scanForDocs(cwd);
  const detected: DetectedFile[] = [];

  for (const file of files) {
    const fileInfo = detectFile(cwd, file);
    detected.push(fileInfo);
  }

  return detected;
}

/**
 * Check if a file should be included in migration (loose files need confirmation)
 */
export function shouldPromptForFile(file: DetectedFile): boolean {
  // files inside docs/ are always included
  if (file.insideDocs) {
    return false;
  }

  // root README is usually kept in place
  if (file.relativePath.toLowerCase() === 'readme.md') {
    return false;
  }

  // loose files outside docs/ need confirmation
  return true;
}
