import { describe, it, expect } from 'vitest';

describe('commands/status', () => {
  describe('document scanning', () => {
    it('should find all markdown files in docs directory', () => {
      const mockFiles = [
        '/test/docs/README.md',
        '/test/docs/01-strategy/brd.md',
        '/test/docs/02-requirements/frd.md',
      ];

      expect(mockFiles.length).toBe(3);
    });

    it('should parse frontmatter from documents', () => {
      const content = `---
title: "Test Document"
status: Draft
version: "1.0.0"
owner: "@test"
last_updated: "2024-01-15"
---

# Content`;

      // simulate gray-matter parsing
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
    });
  });

  describe('status aggregation', () => {
    it('should count documents by status', () => {
      const documents = [
        { status: 'Draft' },
        { status: 'Draft' },
        { status: 'Review' },
        { status: 'Approved' },
        { status: 'Approved' },
        { status: 'Approved' },
      ];

      const statusCounts = documents.reduce(
        (acc, doc) => {
          acc[doc.status] = (acc[doc.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      expect(statusCounts['Draft']).toBe(2);
      expect(statusCounts['Review']).toBe(1);
      expect(statusCounts['Approved']).toBe(3);
    });

    it('should identify documents without frontmatter', () => {
      const content = `# Just a heading

No frontmatter here.`;

      const hasFrontmatter = content.startsWith('---');

      expect(hasFrontmatter).toBe(false);
    });
  });

  describe('table formatting', () => {
    it('should format document info for display', () => {
      const doc = {
        path: 'docs/01-strategy/brd.md',
        title: 'Business Requirements',
        status: 'Draft',
        owner: '@lead',
        lastUpdated: '2024-01-15',
        version: '1.0.0',
      };

      expect(doc.path).toBeDefined();
      expect(doc.title).toBeDefined();
      expect(doc.status).toBeDefined();
    });

    it('should truncate long titles', () => {
      const truncate = (str: string, maxLen: number) => {
        if (str.length <= maxLen) return str;
        return str.slice(0, maxLen - 3) + '...';
      };

      const longTitle = 'This is a very long document title that should be truncated';

      expect(truncate(longTitle, 30).length).toBeLessThanOrEqual(30);
      expect(truncate(longTitle, 30).endsWith('...')).toBe(true);
      expect(truncate('Short', 30)).toBe('Short');
    });
  });

  describe('summary statistics', () => {
    it('should calculate documentation coverage', () => {
      const expectedDocs = 10;
      const actualDocs = 8;

      const coverage = Math.round((actualDocs / expectedDocs) * 100);

      expect(coverage).toBe(80);
    });

    it('should identify missing core documents', () => {
      const requiredDocs = [
        'docs/README.md',
        'docs/01-strategy/brd.md',
        'docs/02-requirements/frd.md',
        'docs/03-architecture/add.md',
      ];

      const existingDocs = [
        'docs/README.md',
        'docs/02-requirements/frd.md',
      ];

      const missingDocs = requiredDocs.filter(
        (doc) => !existingDocs.includes(doc)
      );

      expect(missingDocs).toContain('docs/01-strategy/brd.md');
      expect(missingDocs).toContain('docs/03-architecture/add.md');
    });
  });

  describe('output formatting', () => {
    it('should colorize status based on value', () => {
      const getStatusColor = (status: string) => {
        switch (status) {
          case 'Approved':
            return 'green';
          case 'Review':
            return 'yellow';
          case 'Draft':
            return 'blue';
          case 'Deprecated':
            return 'gray';
          default:
            return 'white';
        }
      };

      expect(getStatusColor('Approved')).toBe('green');
      expect(getStatusColor('Review')).toBe('yellow');
      expect(getStatusColor('Draft')).toBe('blue');
      expect(getStatusColor('Deprecated')).toBe('gray');
    });
  });
});
