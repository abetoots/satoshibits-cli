import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

// detector tests
import {
  classifyDocument,
  detectExistingFrontmatter,
  detectRequirementIds,
  extractTitle,
  shouldPromptForFile,
} from '../src/migrate/detector.js';

// transformer tests
import {
  getTargetPath,
  analyzeFrontmatterChanges,
  updateCrossReferences,
  executeFrontmatterMigration,
} from '../src/migrate/transformer.js';

// backup tests
import {
  createBackup,
  listBackups,
  restoreBackup,
  getBackup,
  generateBackupName,
} from '../src/migrate/backup.js';

import type { DetectedFile, MigrationPlan } from '../src/migrate/types.js';

describe('migrate/detector', () => {
  describe('classifyDocument', () => {
    it('should detect BRD from filename', () => {
      const result = classifyDocument('brd.md', '# Business Requirements');
      expect(result.type).toBe('brd');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect BRD from content', () => {
      const content = `# My Document\n\n## Business Objectives\n\nSome objectives here`;
      const result = classifyDocument('random.md', content);
      expect(result.type).toBe('brd');
    });

    it('should detect FRD from filename', () => {
      const result = classifyDocument('requirements.md', '# Requirements');
      expect(result.type).toBe('frd');
    });

    it('should detect FRD from requirement IDs', () => {
      const content = `# Features\n\nFR-AUTH-001: Login\nFR-AUTH-002: Logout`;
      const result = classifyDocument('features.md', content);
      expect(result.type).toBe('frd');
    });

    it('should detect ADD from filename', () => {
      const result = classifyDocument('architecture.md', '# Architecture');
      expect(result.type).toBe('add');
    });

    it('should detect ADD from content', () => {
      const content = `# Design\n\n## Architecture Overview\n\n## Technology Stack`;
      const result = classifyDocument('design.md', content);
      expect(result.type).toBe('add');
    });

    it('should detect ADR from numbered filename', () => {
      const result = classifyDocument('0001-use-postgres.md', '# Use PostgreSQL');
      expect(result.type).toBe('adr');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect ADR from path', () => {
      const result = classifyDocument('docs/decisions/my-decision.md', '# Decision');
      expect(result.type).toBe('adr');
    });

    it('should detect README', () => {
      const result = classifyDocument('README.md', '# Project Name');
      expect(result.type).toBe('readme');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should return unknown for unrecognized files', () => {
      const result = classifyDocument('random-notes.md', '# Some notes');
      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('detectExistingFrontmatter', () => {
    it('should parse valid frontmatter', () => {
      const content = `---
title: Test
status: Draft
---
# Content`;
      const result = detectExistingFrontmatter(content);
      expect(result).toEqual({ title: 'Test', status: 'Draft' });
    });

    it('should return null for no frontmatter', () => {
      const content = '# Just a heading\n\nSome content';
      const result = detectExistingFrontmatter(content);
      expect(result).toBeNull();
    });

    it('should return null for empty frontmatter', () => {
      const content = '---\n---\n# Content';
      const result = detectExistingFrontmatter(content);
      expect(result).toBeNull();
    });
  });

  describe('detectRequirementIds', () => {
    it('should detect standard FR-XXX-NNN format', () => {
      const content = 'FR-AUTH-001 and FR-AUTH-002 are requirements';
      const result = detectRequirementIds(content);
      expect(result.ids).toContain('FR-AUTH-001');
      expect(result.ids).toContain('FR-AUTH-002');
    });

    it('should detect simple REQ-NNN format', () => {
      const content = 'REQ-001 and REQ-002';
      const result = detectRequirementIds(content);
      expect(result.ids.length).toBeGreaterThan(0);
    });

    it('should return empty for no IDs', () => {
      const content = 'No requirement IDs here';
      const result = detectRequirementIds(content);
      expect(result.ids).toEqual([]);
      expect(result.pattern).toBeNull();
    });
  });

  describe('extractTitle', () => {
    it('should extract H1 heading', () => {
      const content = '# My Document Title\n\nSome content';
      expect(extractTitle(content)).toBe('My Document Title');
    });

    it('should return null for no H1', () => {
      const content = '## Secondary heading\n\nContent';
      expect(extractTitle(content)).toBeNull();
    });
  });

  describe('shouldPromptForFile', () => {
    it('should not prompt for files inside docs/', () => {
      const file: DetectedFile = {
        relativePath: 'docs/requirements.md',
        absolutePath: '/test/docs/requirements.md',
        insideDocs: true,
        detectedType: 'frd',
        confidence: 0.8,
        frontmatter: null,
        content: '',
      };
      expect(shouldPromptForFile(file)).toBe(false);
    });

    it('should not prompt for root README', () => {
      const file: DetectedFile = {
        relativePath: 'README.md',
        absolutePath: '/test/README.md',
        insideDocs: false,
        detectedType: 'readme',
        confidence: 0.95,
        frontmatter: null,
        content: '',
      };
      expect(shouldPromptForFile(file)).toBe(false);
    });

    it('should prompt for loose files outside docs/', () => {
      const file: DetectedFile = {
        relativePath: 'architecture.md',
        absolutePath: '/test/architecture.md',
        insideDocs: false,
        detectedType: 'add',
        confidence: 0.8,
        frontmatter: null,
        content: '',
      };
      expect(shouldPromptForFile(file)).toBe(true);
    });
  });
});

describe('migrate/transformer', () => {
  describe('getTargetPath', () => {
    it('should map BRD to correct path', () => {
      const file: DetectedFile = {
        relativePath: 'brd.md',
        absolutePath: '/test/brd.md',
        insideDocs: false,
        detectedType: 'brd',
        confidence: 0.8,
        frontmatter: null,
        content: '',
      };
      expect(getTargetPath(file)).toBe('docs/01-strategy/brd.md');
    });

    it('should map FRD to correct path', () => {
      const file: DetectedFile = {
        relativePath: 'requirements.md',
        absolutePath: '/test/requirements.md',
        insideDocs: false,
        detectedType: 'frd',
        confidence: 0.8,
        frontmatter: null,
        content: '',
      };
      expect(getTargetPath(file)).toBe('docs/02-requirements/frd.md');
    });

    it('should map ADD to correct path', () => {
      const file: DetectedFile = {
        relativePath: 'architecture.md',
        absolutePath: '/test/architecture.md',
        insideDocs: false,
        detectedType: 'add',
        confidence: 0.8,
        frontmatter: null,
        content: '',
      };
      expect(getTargetPath(file)).toBe('docs/03-architecture/add.md');
    });

    it('should preserve ADR filename', () => {
      const file: DetectedFile = {
        relativePath: '0001-use-postgres.md',
        absolutePath: '/test/0001-use-postgres.md',
        insideDocs: false,
        detectedType: 'adr',
        confidence: 0.9,
        frontmatter: null,
        content: '',
      };
      expect(getTargetPath(file)).toBe('docs/03-architecture/decisions/0001-use-postgres.md');
    });

    it('should map specs to correct directory', () => {
      const file: DetectedFile = {
        relativePath: 'api-spec.md',
        absolutePath: '/test/api-spec.md',
        insideDocs: false,
        detectedType: 'spec',
        confidence: 0.7,
        frontmatter: null,
        content: '',
      };
      expect(getTargetPath(file)).toBe('docs/04-specs/api-spec.md');
    });
  });

  describe('analyzeFrontmatterChanges', () => {
    it('should add all required fields when missing', () => {
      const file: DetectedFile = {
        relativePath: 'docs/test.md',
        absolutePath: '/test/docs/test.md',
        insideDocs: true,
        detectedType: 'spec',
        confidence: 0.7,
        frontmatter: null,
        content: '# Test Document',
      };
      const changes = analyzeFrontmatterChanges(file, '@owner');

      const addedFields = changes.filter(c => c.action === 'add').map(c => c.field);
      expect(addedFields).toContain('id');
      expect(addedFields).toContain('title');
      expect(addedFields).toContain('status');
      expect(addedFields).toContain('version');
      expect(addedFields).toContain('owner');
      expect(addedFields).toContain('last_updated');
    });

    it('should extract title from H1', () => {
      const file: DetectedFile = {
        relativePath: 'docs/test.md',
        absolutePath: '/test/docs/test.md',
        insideDocs: true,
        detectedType: 'spec',
        confidence: 0.7,
        frontmatter: null,
        content: '# My Great Document\n\nContent here',
      };
      const changes = analyzeFrontmatterChanges(file, '@owner');

      const titleChange = changes.find(c => c.field === 'title');
      expect(titleChange?.newValue).toBe('My Great Document');
    });

    it('should normalize status values', () => {
      const file: DetectedFile = {
        relativePath: 'docs/test.md',
        absolutePath: '/test/docs/test.md',
        insideDocs: true,
        detectedType: 'spec',
        confidence: 0.7,
        frontmatter: { status: 'wip', title: 'Test', version: '1.0.0', owner: '@me', last_updated: '2024-01-01', id: 'TEST-001' },
        content: '# Test',
      };
      const changes = analyzeFrontmatterChanges(file, '@owner');

      const statusChange = changes.find(c => c.field === 'status');
      expect(statusChange?.newValue).toBe('Draft');
    });

    it('should not change already valid frontmatter', () => {
      const file: DetectedFile = {
        relativePath: 'docs/test.md',
        absolutePath: '/test/docs/test.md',
        insideDocs: true,
        detectedType: 'spec',
        confidence: 0.7,
        frontmatter: {
          id: 'SPEC-001',
          title: 'Test',
          status: 'Draft',
          version: '1.0.0',
          owner: '@owner',
          last_updated: '2024-01-01',
        },
        content: '# Test',
      };
      const changes = analyzeFrontmatterChanges(file, '@owner');

      expect(changes.length).toBe(0);
    });
  });

  describe('updateCrossReferences', () => {
    it('should update links when file and target both moved', () => {
      // scenario: architecture.md at root links to ./requirements.md
      // both files get moved to new locations
      const content = '# Architecture\n\nSee [requirements](./requirements.md) for details.';
      const pathMapping = new Map([
        ['architecture.md', 'docs/03-architecture/add.md'],
        ['requirements.md', 'docs/02-requirements/frd.md'],
      ]);

      const result = updateCrossReferences(
        content,
        pathMapping,
        'architecture.md',          // original path
        'docs/03-architecture/add.md' // new path
      );

      // link should now point from docs/03-architecture/ to docs/02-requirements/
      expect(result).toContain('../02-requirements/frd.md');
    });

    it('should preserve anchors in links', () => {
      const content = 'See [section](./requirements.md#section-1)';
      const pathMapping = new Map([
        ['architecture.md', 'docs/03-architecture/add.md'],
        ['requirements.md', 'docs/02-requirements/frd.md'],
      ]);

      const result = updateCrossReferences(
        content,
        pathMapping,
        'architecture.md',
        'docs/03-architecture/add.md'
      );

      expect(result).toContain('../02-requirements/frd.md#section-1');
    });

    it('should not update external links', () => {
      const content = 'See [docs](https://example.com/docs.md)';
      const pathMapping = new Map([
        ['docs.md', 'docs/04-specs/docs.md'],
      ]);

      const result = updateCrossReferences(
        content,
        pathMapping,
        'readme.md',
        'docs/README.md'
      );

      expect(result).toContain('https://example.com/docs.md');
    });

    it('should handle files that were not moved', () => {
      // file at docs/existing.md links to sibling that was moved
      const content = 'See [old](./old-spec.md)';
      const pathMapping = new Map([
        ['docs/old-spec.md', 'docs/04-specs/spec.md'],
      ]);

      const result = updateCrossReferences(
        content,
        pathMapping,
        'docs/existing.md',  // original (same as new - not moved)
        'docs/existing.md'   // new path
      );

      // path.relative returns '04-specs/spec.md' (without leading ./)
      expect(result).toContain('04-specs/spec.md');
    });
  });

  describe('executeFrontmatterMigration with moved files', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(tmpdir(), 'migrate-frontmatter-test-'));
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should update frontmatter in files that were moved by structure migration', () => {
      // setup: create a file at docs/old-location/test.md
      const oldDir = path.join(testDir, 'docs', 'old-location');
      fs.mkdirSync(oldDir, { recursive: true });
      fs.writeFileSync(
        path.join(oldDir, 'test.md'),
        '# Test Document\n\nContent here'
      );

      // create detected file object with original path
      const detectedFile: DetectedFile = {
        relativePath: 'docs/old-location/test.md',
        absolutePath: path.join(testDir, 'docs/old-location/test.md'),
        insideDocs: true,
        detectedType: 'spec',
        confidence: 0.7,
        frontmatter: null,
        content: '# Test Document\n\nContent here',
      };

      // simulate structure migration: move file to new location
      const newDir = path.join(testDir, 'docs', '04-specs');
      fs.mkdirSync(newDir, { recursive: true });
      fs.renameSync(
        path.join(testDir, 'docs/old-location/test.md'),
        path.join(testDir, 'docs/04-specs/test.md')
      );

      // create file mapping from structure migration
      const fileMapping = new Map([
        ['docs/old-location/test.md', 'docs/04-specs/test.md']
      ]);

      // create frontmatter migration plan (using original path)
      const plan: MigrationPlan = {
        timestamp: new Date().toISOString(),
        tier: 'frontmatter',
        items: [{
          source: detectedFile,
          targetPath: 'docs/old-location/test.md', // original path
          action: 'add-frontmatter',
          hasConflict: false,
          frontmatterChanges: [
            { field: 'id', oldValue: null, newValue: 'SPEC-001', action: 'add' },
            { field: 'title', oldValue: null, newValue: 'Test Document', action: 'add' },
            { field: 'status', oldValue: null, newValue: 'Draft', action: 'add' },
          ],
        }],
        summary: { totalFiles: 1, filesToMove: 0, filesToSkip: 0, conflicts: 0, frontmatterChanges: 3, idTransformations: 0 },
      };

      // this should NOT throw - it should use fileMapping to find the actual path
      expect(() => {
        executeFrontmatterMigration(testDir, plan, fileMapping);
      }).not.toThrow();

      // verify frontmatter was added to the moved file
      const content = fs.readFileSync(path.join(testDir, 'docs/04-specs/test.md'), 'utf-8');
      expect(content).toContain('id: SPEC-001');
      expect(content).toContain('title: Test Document');
    });
  });
});

describe('migrate/backup', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(tmpdir(), 'migrate-test-'));
    // create a docs directory with test files
    const docsDir = path.join(testDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'test.md'), '# Test');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateBackupName', () => {
    it('should generate timestamp-based name', () => {
      const name = generateBackupName();
      expect(name).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });
  });

  describe('createBackup', () => {
    it('should create backup directory and manifest', () => {
      const backupName = createBackup(testDir, 'structure', ['docs/test.md']);

      const backupPath = path.join(testDir, '.create-docs-backups', backupName);
      expect(fs.existsSync(backupPath)).toBe(true);

      const manifestPath = path.join(backupPath, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { tier: string; files: string[] };
      expect(manifest.tier).toBe('structure');
      expect(manifest.files.length).toBe(1);
    });

    it('should copy files to backup', () => {
      const backupName = createBackup(testDir, 'structure', ['docs/test.md']);

      const backupFilePath = path.join(testDir, '.create-docs-backups', backupName, 'docs/test.md');
      expect(fs.existsSync(backupFilePath)).toBe(true);
      expect(fs.readFileSync(backupFilePath, 'utf-8')).toBe('# Test');
    });
  });

  describe('listBackups', () => {
    it('should return empty array when no backups', () => {
      const backups = listBackups(testDir);
      expect(backups).toEqual([]);
    });

    it('should list created backups', () => {
      createBackup(testDir, 'structure', ['docs/test.md']);

      const backups = listBackups(testDir);
      expect(backups.length).toBe(1);
      expect(backups[0]?.manifest.tier).toBe('structure');
    });
  });

  describe('getBackup', () => {
    it('should return null for non-existent backup', () => {
      const backup = getBackup(testDir, 'non-existent');
      expect(backup).toBeNull();
    });

    it('should return backup info', () => {
      const backupName = createBackup(testDir, 'structure', ['docs/test.md']);

      const backup = getBackup(testDir, backupName);
      expect(backup).not.toBeNull();
      expect(backup?.name).toBe(backupName);
      expect(backup?.manifest.tier).toBe('structure');
    });
  });

  describe('restoreBackup', () => {
    it('should restore backed up files', () => {
      const backupName = createBackup(testDir, 'structure', ['docs/test.md']);

      // modify the original file
      fs.writeFileSync(path.join(testDir, 'docs/test.md'), '# Modified');

      const result = restoreBackup(testDir, backupName);

      expect(result.restored).toContain('docs/test.md');
      expect(fs.readFileSync(path.join(testDir, 'docs/test.md'), 'utf-8')).toBe('# Test');
    });

    it('should throw for non-existent backup', () => {
      expect(() => restoreBackup(testDir, 'non-existent')).toThrow('Backup not found');
    });
  });
});
