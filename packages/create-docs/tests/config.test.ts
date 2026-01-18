import { describe, it, expect } from 'vitest';
import { createDefaultConfig } from '../src/config/manager.js';
import type { CreateDocsConfig, VarianceConfig } from '../src/types.js';

describe('config/manager', () => {
  describe('createDefaultConfig', () => {
    it('should create config with required fields', () => {
      const variance: VarianceConfig = {
        hasApi: false,
        hasDatabase: false,
        hasAsyncProcessing: false,
        isRegulated: false,
      };
      const config = createDefaultConfig('Test Project', 'greenfield', '@owner', variance);

      expect(config.projectName).toBe('Test Project');
      expect(config.owner).toBe('@owner');
      expect(config.profile).toBe('greenfield');
      expect(config.adrCounter).toBe(0);
      expect(config.variance).toBeDefined();
    });

    it('should use provided variance config', () => {
      const variance: VarianceConfig = {
        hasApi: true,
        hasDatabase: true,
        hasAsyncProcessing: false,
        isRegulated: false,
      };
      const config = createDefaultConfig('Test', 'greenfield', '@owner', variance);

      expect(config.variance.hasApi).toBe(true);
      expect(config.variance.hasDatabase).toBe(true);
      expect(config.variance.hasAsyncProcessing).toBe(false);
      expect(config.variance.isRegulated).toBe(false);
    });

    it('should support different profiles', () => {
      const variance: VarianceConfig = {
        hasApi: false,
        hasDatabase: false,
        hasAsyncProcessing: false,
        isRegulated: false,
      };

      const greenfieldConfig = createDefaultConfig('Test', 'greenfield', '@owner', variance);
      expect(greenfieldConfig.profile).toBe('greenfield');

      const migrationConfig = createDefaultConfig('Test', 'migration', '@owner', variance);
      expect(migrationConfig.profile).toBe('migration');

      const libraryConfig = createDefaultConfig('Test', 'library', '@owner', variance);
      expect(libraryConfig.profile).toBe('library');
    });

    it('should include createdAt date', () => {
      const variance: VarianceConfig = {
        hasApi: false,
        hasDatabase: false,
        hasAsyncProcessing: false,
        isRegulated: false,
      };
      const config = createDefaultConfig('Test', 'greenfield', '@owner', variance);

      expect(config.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('config structure', () => {
    it('should have correct CreateDocsConfig shape', () => {
      const config: CreateDocsConfig = {
        projectName: 'Test',
        profile: 'greenfield',
        owner: '@test',
        adrCounter: 5,
        variance: {
          hasApi: true,
          hasDatabase: true,
          hasAsyncProcessing: false,
          isRegulated: false,
        },
        createdAt: '2024-01-01',
      };

      expect(config.projectName).toBeDefined();
      expect(config.profile).toBeDefined();
      expect(config.owner).toBeDefined();
      expect(config.adrCounter).toBeDefined();
      expect(config.variance).toBeDefined();
    });

    it('should support all profile types', () => {
      const profiles: CreateDocsConfig['profile'][] = ['greenfield', 'migration', 'library'];

      expect(profiles).toContain('greenfield');
      expect(profiles).toContain('migration');
      expect(profiles).toContain('library');
    });
  });

  describe('variance config', () => {
    it('should have all required fields', () => {
      const variance: VarianceConfig = {
        hasApi: true,
        hasDatabase: true,
        hasAsyncProcessing: true,
        isRegulated: true,
      };

      expect(variance.hasApi).toBeDefined();
      expect(variance.hasDatabase).toBeDefined();
      expect(variance.hasAsyncProcessing).toBeDefined();
      expect(variance.isRegulated).toBeDefined();
    });
  });
});
