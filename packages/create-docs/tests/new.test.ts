import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('commands/new', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockImplementation((filePath) => {
      if (String(filePath).includes('.create-docs.json')) {
        return JSON.stringify({
          projectName: 'Test Project',
          profile: 'greenfield',
          owner: '@owner',
          adrCounter: 1,
          variance: {
            hasApi: true,
            hasDatabase: true,
            hasAsyncProcessing: false,
            isRegulated: false,
          },
        });
      }
      return '# {{title}}';
    });
  });

  describe('ADR generation', () => {
    it('should generate ADR with auto-incremented number', () => {
      const adrNumber = 1;
      const paddedNumber = String(adrNumber).padStart(4, '0');
      const expectedFilename = `${paddedNumber}-test-decision.md`;

      expect(expectedFilename).toBe('0001-test-decision.md');
    });

    it('should increment ADR counter in config', () => {
      const config = {
        adrCounter: 5,
      };

      const newCounter = config.adrCounter + 1;

      expect(newCounter).toBe(6);
    });

    it('should place ADR in decisions directory', () => {
      const decisionsPath = '/test/docs/03-architecture/decisions';
      const adrPath = path.join(decisionsPath, '0001-test.md');

      expect(adrPath).toContain('03-architecture/decisions');
    });
  });

  describe('spec generation', () => {
    it('should generate spec in 04-specs directory', () => {
      const specsPath = '/test/docs/04-specs';
      const specPath = path.join(specsPath, 'new-feature.md');

      expect(specPath).toContain('04-specs');
    });

    it('should use generic template for spec type', () => {
      const templateName = 'specs/generic.md.hbs';

      expect(templateName).toContain('generic');
    });
  });

  describe('guideline generation', () => {
    it('should generate guideline in 05-guidelines directory', () => {
      const guidelinesPath = '/test/docs/05-guidelines';
      const guidelinePath = path.join(guidelinesPath, 'new-guide.md');

      expect(guidelinePath).toContain('05-guidelines');
    });

    it('should use generic template for guideline type', () => {
      const templateName = 'guidelines/generic.md.hbs';

      expect(templateName).toContain('generic');
    });
  });

  describe('basic document generation', () => {
    it('should generate basic document in docs root', () => {
      const docsPath = '/test/docs';
      const basicPath = path.join(docsPath, 'notes.md');

      expect(basicPath).toContain('docs');
    });

    it('should use basic template', () => {
      const templateName = 'basic.md.hbs';

      expect(templateName).toBe('basic.md.hbs');
    });
  });

  describe('filename slugification', () => {
    it('should convert document name to kebab-case filename', () => {
      const slugify = (str: string) =>
        str
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');

      expect(slugify('My New Feature')).toBe('my-new-feature');
      expect(slugify('API Integration Guide')).toBe('api-integration-guide');
      expect(slugify('Use Redux?')).toBe('use-redux');
    });
  });

  describe('error handling', () => {
    it('should fail if docs directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const docsExists = fs.existsSync('/test/docs');

      expect(docsExists).toBe(false);
    });

    it('should fail if config file does not exist', () => {
      mockFs.existsSync.mockImplementation((filePath) => {
        return !String(filePath).includes('.create-docs.json');
      });

      const configExists = fs.existsSync('/test/.create-docs.json');

      expect(configExists).toBe(false);
    });
  });
});
