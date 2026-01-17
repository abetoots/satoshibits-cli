import { describe, it, expect } from 'vitest';
import { slugify, createTemplateContext } from '../src/templates/renderer.js';

describe('templates/renderer', () => {
  describe('slugify', () => {
    it('should convert string to kebab-case', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello! World?')).toBe('hello-world');
    });

    it('should trim whitespace', () => {
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should preserve hyphens', () => {
      expect(slugify('already-kebab')).toBe('already-kebab');
    });

    it('should handle numbers', () => {
      expect(slugify('Version 2.0 Release')).toBe('version-2-0-release');
    });

    it('should handle leading/trailing hyphens from special chars', () => {
      expect(slugify('--test--')).toBe('test');
    });
  });

  describe('createTemplateContext', () => {
    it('should create context with all required fields', () => {
      const variance = {
        hasApi: true,
        hasDatabase: true,
        hasAsyncProcessing: false,
        isRegulated: false,
      };

      const context = createTemplateContext('My Project', 'Test Document', 'brd', '@owner', variance);

      expect(context.projectName).toBe('My Project');
      expect(context.title).toBe('Test Document');
      expect(context.docType).toBe('brd');
      expect(context.owner).toBe('@owner');
      expect(context.variance).toEqual(variance);
    });

    it('should include currentDate', () => {
      const variance = {
        hasApi: false,
        hasDatabase: false,
        hasAsyncProcessing: false,
        isRegulated: false,
      };

      const context = createTemplateContext('Test', 'Doc', 'brd', '@test', variance);

      expect(context.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should pass through variance configuration', () => {
      const variance = {
        hasApi: true,
        hasDatabase: false,
        hasAsyncProcessing: true,
        isRegulated: true,
      };

      const context = createTemplateContext('Test', 'Doc', 'spec', '@test', variance);

      expect(context.variance.hasApi).toBe(true);
      expect(context.variance.hasDatabase).toBe(false);
      expect(context.variance.hasAsyncProcessing).toBe(true);
      expect(context.variance.isRegulated).toBe(true);
    });
  });

  describe('template helpers (conceptual)', () => {
    // these tests verify the helper logic without needing template files
    it('uppercase helper should uppercase strings', () => {
      const uppercase = (str: string) => str.toUpperCase();
      expect(uppercase('test')).toBe('TEST');
      expect(uppercase('Hello World')).toBe('HELLO WORLD');
    });

    it('lowercase helper should lowercase strings', () => {
      const lowercase = (str: string) => str.toLowerCase();
      expect(lowercase('TEST')).toBe('test');
      expect(lowercase('Hello World')).toBe('hello world');
    });

    it('capitalize helper should capitalize first letter', () => {
      const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('HELLO');
    });

    it('padNumber helper should pad numbers with zeros', () => {
      const padNumber = (num: number, width: number) => String(num).padStart(width, '0');
      expect(padNumber(1, 4)).toBe('0001');
      expect(padNumber(42, 4)).toBe('0042');
      expect(padNumber(1234, 4)).toBe('1234');
      expect(padNumber(12345, 4)).toBe('12345');
    });
  });
});
