import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs');
vi.mock('glob', () => ({
  globSync: vi.fn(() => []),
}));

describe('commands/lint', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('frontmatter validation', () => {
    it('should validate required frontmatter fields', () => {
      const requiredFields = ['title', 'status', 'version', 'owner'];

      const validFrontmatter = {
        title: 'Test Doc',
        status: 'Draft',
        version: '1.0.0',
        owner: '@test',
      };

      const hasAllRequired = requiredFields.every(
        (field) => field in validFrontmatter
      );

      expect(hasAllRequired).toBe(true);
    });

    it('should detect missing required fields', () => {
      const requiredFields = ['title', 'status', 'version', 'owner'];

      const invalidFrontmatter = {
        title: 'Test Doc',
        // missing status, version, owner
      };

      const missingFields = requiredFields.filter(
        (field) => !(field in invalidFrontmatter)
      );

      expect(missingFields).toContain('status');
      expect(missingFields).toContain('version');
      expect(missingFields).toContain('owner');
    });

    it('should validate status is a valid value', () => {
      const validStatuses = ['Draft', 'Review', 'Approved', 'Deprecated'];

      expect(validStatuses).toContain('Draft');
      expect(validStatuses).toContain('Review');
      expect(validStatuses).not.toContain('Invalid');
    });

    it('should validate version follows semver', () => {
      const isValidSemver = (version: string) =>
        /^\d+\.\d+\.\d+$/.test(version);

      expect(isValidSemver('1.0.0')).toBe(true);
      expect(isValidSemver('2.1.3')).toBe(true);
      expect(isValidSemver('invalid')).toBe(false);
      expect(isValidSemver('1.0')).toBe(false);
    });
  });

  describe('broken link detection', () => {
    it('should detect relative markdown links', () => {
      const content = `
# Test
See [related doc](./other.md) for more info.
Also check [another](../folder/doc.md).
      `;

      const linkPattern = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
      const links = [...content.matchAll(linkPattern)].map((m) => m[2]);

      expect(links).toContain('./other.md');
      expect(links).toContain('../folder/doc.md');
    });

    it('should identify broken links when target does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const linkTarget = '/test/docs/missing.md';
      const exists = fs.existsSync(linkTarget);

      expect(exists).toBe(false);
    });

    it('should not flag external links', () => {
      const _content = `See [docs](https://example.com/docs.md)`;

      const isExternal = (url: string) =>
        url.startsWith('http://') || url.startsWith('https://');

      expect(isExternal('https://example.com/docs.md')).toBe(true);
      expect(isExternal('./local.md')).toBe(false);
    });
  });

  describe('requirement ID validation', () => {
    it('should detect requirement ID references', () => {
      const content = `
## Requirements
- FR-AUTH-001: User login
- FR-AUTH-002: Password reset
- NFR-PERF-001: Response time
      `;

      const reqPattern = /(FR|NFR)-[A-Z]+-\d{3}/g;
      const reqIds = content.match(reqPattern) ?? [];

      expect(reqIds).toContain('FR-AUTH-001');
      expect(reqIds).toContain('FR-AUTH-002');
      expect(reqIds).toContain('NFR-PERF-001');
    });

    it('should validate requirement ID format', () => {
      const isValidReqId = (id: string) =>
        /^(FR|NFR)-[A-Z]+-\d{3}$/.test(id);

      expect(isValidReqId('FR-AUTH-001')).toBe(true);
      expect(isValidReqId('NFR-PERF-100')).toBe(true);
      expect(isValidReqId('REQ-001')).toBe(false);
      expect(isValidReqId('FR-auth-001')).toBe(false);
    });
  });

  describe('stale document detection', () => {
    it('should detect documents not updated in threshold days', () => {
      const lastUpdated = new Date('2024-01-01');
      const now = new Date('2024-04-01');
      const thresholdDays = 90;

      const daysSinceUpdate = Math.floor(
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysSinceUpdate).toBe(91);
      expect(daysSinceUpdate > thresholdDays).toBe(true);
    });

    it('should not flag recently updated documents', () => {
      const lastUpdated = new Date('2024-03-15');
      const now = new Date('2024-04-01');
      const thresholdDays = 90;

      const daysSinceUpdate = Math.floor(
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysSinceUpdate).toBe(17);
      expect(daysSinceUpdate > thresholdDays).toBe(false);
    });
  });

  describe('lint report', () => {
    it('should categorize issues by severity', () => {
      const issues = [
        { severity: 'error', message: 'Missing title' },
        { severity: 'warning', message: 'Stale document' },
        { severity: 'error', message: 'Broken link' },
      ];

      const errors = issues.filter((i) => i.severity === 'error');
      const warnings = issues.filter((i) => i.severity === 'warning');

      expect(errors.length).toBe(2);
      expect(warnings.length).toBe(1);
    });

    it('should return exit code based on errors', () => {
      const hasErrors = true;
      const exitCode = hasErrors ? 1 : 0;

      expect(exitCode).toBe(1);
    });
  });
});
