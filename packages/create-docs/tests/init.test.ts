import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// mock dependencies before importing initCommand
vi.mock('fs');
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));
vi.mock('chalk', () => ({
  default: {
    blue: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    cyan: (s: string) => s,
  },
}));
vi.mock('../src/config/manager.js', () => ({
  configExists: vi.fn(),
  docsExist: vi.fn(),
  saveConfig: vi.fn(),
  createDefaultConfig: vi.fn(() => ({ project: 'test' })),
  getDocsPath: vi.fn((cwd: string) => path.join(cwd, 'docs')),
}));
vi.mock('../src/prompts/questions.js', () => ({
  initQuestions: [],
  answersToVariance: vi.fn(() => ({
    hasApi: true,
    hasDatabase: true,
    hasAsyncProcessing: false,
    isRegulated: false,
  })),
  QuestionNames: {
    databaseEngine: 'databaseEngine',
    ormStrategy: 'ormStrategy',
    hasApi: 'hasApi',
    apiStyle: 'apiStyle',
    apiVersioning: 'apiVersioning',
    identityProvider: 'identityProvider',
    authStrategy: 'authStrategy',
    hasAsyncProcessing: 'hasAsyncProcessing',
    messagingPattern: 'messagingPattern',
    messageBroker: 'messageBroker',
  },
}));
vi.mock('../src/templates/renderer.js', () => ({
  renderTemplate: vi.fn(() => '# Mock Template Content'),
  createTemplateContext: vi.fn(() => ({})),
}));

import { initCommand } from '../src/commands/init.js';
import inquirer from 'inquirer';
import { configExists, docsExist, saveConfig } from '../src/config/manager.js';

describe('commands/init', () => {
  const mockFs = vi.mocked(fs);
  const mockInquirer = vi.mocked(inquirer);
  const mockConfigExists = vi.mocked(configExists);
  const mockDocsExist = vi.mocked(docsExist);
  const mockSaveConfig = vi.mocked(saveConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    // default: fresh project with no existing docs or config
    mockConfigExists.mockReturnValue(false);
    mockDocsExist.mockReturnValue(false);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockReturnValue('{}');
    // silence console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  describe('directory creation', () => {
    it('should create docs directory structure', async () => {
      await initCommand({ yes: true });

      // verify mkdirSync was called for each directory
      const mkdirCalls = mockFs.mkdirSync.mock.calls.map((call) => call[0]);
      expect(mkdirCalls.some((p) => String(p).includes('00-meta'))).toBe(true);
      expect(mkdirCalls.some((p) => String(p).includes('01-strategy'))).toBe(true);
      expect(mkdirCalls.some((p) => String(p).includes('02-requirements'))).toBe(true);
      expect(mkdirCalls.some((p) => String(p).includes('03-architecture'))).toBe(true);
      expect(mkdirCalls.some((p) => String(p).includes('04-specs'))).toBe(true);
      expect(mkdirCalls.some((p) => String(p).includes('05-guidelines'))).toBe(true);
      expect(mkdirCalls.some((p) => String(p).includes('06-operations'))).toBe(true);
    });
  });

  describe('document generation', () => {
    it('should generate readme in docs root', async () => {
      await initCommand({ yes: true });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => call[0]);
      expect(writeCalls.some((p) => String(p).endsWith('README.md'))).toBe(true);
    });

    it('should generate glossary in 00-meta', async () => {
      await initCommand({ yes: true });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => call[0]);
      expect(writeCalls.some((p) => String(p).includes('00-meta') && String(p).endsWith('glossary.md'))).toBe(true);
    });

    it('should generate core documents for greenfield profile', async () => {
      await initCommand({ yes: true, profile: 'greenfield' });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));

      // greenfield includes brd
      expect(writeCalls.some((p) => p.includes('01-strategy') && p.endsWith('brd.md'))).toBe(true);
      expect(writeCalls.some((p) => p.includes('02-requirements') && p.endsWith('frd.md'))).toBe(true);
      expect(writeCalls.some((p) => p.includes('03-architecture') && p.endsWith('add.md'))).toBe(true);
    });
  });

  describe('profile-based generation', () => {
    it('should include brd for greenfield profile', async () => {
      await initCommand({ yes: true, profile: 'greenfield' });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      expect(writeCalls.some((p) => p.endsWith('brd.md'))).toBe(true);
    });

    it('should skip brd for migration profile', async () => {
      await initCommand({ yes: true, profile: 'migration' });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      expect(writeCalls.some((p) => p.endsWith('brd.md'))).toBe(false);
    });

    it('should skip brd and frd for library profile', async () => {
      await initCommand({ yes: true, profile: 'library' });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      expect(writeCalls.some((p) => p.endsWith('brd.md'))).toBe(false);
      expect(writeCalls.some((p) => p.endsWith('frd.md'))).toBe(false);
    });
  });

  describe('variance-based generation', () => {
    it('should generate api spec when hasApi is true', async () => {
      // default mock has hasApi: true
      await initCommand({ yes: true });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      expect(writeCalls.some((p) => p.includes('04-specs') && p.endsWith('api.md'))).toBe(true);
    });

    it('should generate database spec when hasDatabase is true', async () => {
      // default mock has hasDatabase: true
      await initCommand({ yes: true });

      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      expect(writeCalls.some((p) => p.includes('04-specs') && p.endsWith('database.md'))).toBe(true);
    });
  });

  describe('incremental mode', () => {
    it('should skip existing files when not using force', async () => {
      // simulate: docs and config exist, and a specific file exists
      mockConfigExists.mockReturnValue(true);
      mockDocsExist.mockReturnValue(true);

      mockFs.existsSync.mockImplementation((p) => {
        const pathStr = String(p);
        // README.md exists, other files don't
        return pathStr.endsWith('README.md');
      });

      await initCommand({ yes: true, force: false });

      // README.md should NOT be written (it exists)
      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      const readmeWrites = writeCalls.filter((p) => p.endsWith('README.md'));
      expect(readmeWrites.length).toBe(0);
    });

    it('should overwrite existing files when using force', async () => {
      mockConfigExists.mockReturnValue(true);
      mockDocsExist.mockReturnValue(true);

      mockFs.existsSync.mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.endsWith('README.md');
      });

      await initCommand({ yes: true, force: true });

      // README.md SHOULD be written (force overrides)
      const writeCalls = mockFs.writeFileSync.mock.calls.map((call) => String(call[0]));
      const readmeWrites = writeCalls.filter((p) => p.endsWith('README.md'));
      expect(readmeWrites.length).toBe(1);
    });

    it('should create new files regardless of force flag', async () => {
      mockConfigExists.mockReturnValue(true);
      mockDocsExist.mockReturnValue(true);

      // no files exist
      mockFs.existsSync.mockReturnValue(false);

      await initCommand({ yes: true, force: false });

      // files should be written since they don't exist
      const writeCalls = mockFs.writeFileSync.mock.calls;
      expect(writeCalls.length).toBeGreaterThan(0);
    });

    it('should skip config when it exists and force is false', async () => {
      mockConfigExists.mockReturnValue(true);
      mockDocsExist.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);

      await initCommand({ yes: true, force: false });

      // saveConfig should NOT be called (config exists, no force)
      expect(mockSaveConfig).not.toHaveBeenCalled();
    });

    it('should update config when force is true', async () => {
      mockConfigExists.mockReturnValue(true);
      mockDocsExist.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);

      await initCommand({ yes: true, force: true });

      // saveConfig SHOULD be called (force overrides)
      expect(mockSaveConfig).toHaveBeenCalled();
    });
  });

  describe('interactive mode', () => {
    it('should prompt user when yes flag is not set', async () => {
      mockInquirer.prompt.mockResolvedValue({
        projectName: 'test-project',
        profile: 'greenfield',
        owner: '@test-owner',
        hasApi: true,
        hasAsyncProcessing: false,
        isRegulated: false,
        cloudProvider: 'aws',
        gitStrategy: 'trunk-based',
        databaseEngine: 'postgres',
        identityProvider: 'auth0',
        ormStrategy: 'prisma',
        apiStyle: 'rest',
        apiVersioning: 'url-path',
        authStrategy: 'jwt',
        cacheLayer: 'redis',
        hasFrontend: false,
      });

      await initCommand({});

      expect(mockInquirer.prompt).toHaveBeenCalled();
    });

    it('should not prompt when yes flag is set', async () => {
      await initCommand({ yes: true });

      expect(mockInquirer.prompt).not.toHaveBeenCalled();
    });
  });
});
