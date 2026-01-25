/**
 * Shared test utilities for claude-skill-runtime tests
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { vi } from 'vitest';
import type { SessionData, SkillConfig, SkillRule } from '../types.mjs';

/**
 * Create a temporary test directory
 */
export function createTempDir(prefix = 'skill-runtime-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Clean up a test directory
 */
export function cleanupTempDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Setup mock project structure with .claude/skills directory
 */
export function setupMockProject(tmpDir: string): void {
  const skillsDir = path.join(tmpDir, '.claude', 'skills');
  const cacheDir = path.join(tmpDir, '.claude', 'cache');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * Create skill-rules.yaml with custom config
 */
export function createSkillRulesYaml(tmpDir: string, config: Partial<SkillConfig>): string {
  const skillsDir = path.join(tmpDir, '.claude', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });

  const fullConfig: SkillConfig = {
    version: config.version ?? '1.0',
    description: config.description ?? 'Test config',
    settings: config.settings,
    skills: config.skills ?? {},
  };

  const yamlContent = generateYaml(fullConfig);
  const yamlPath = path.join(skillsDir, 'skill-rules.yaml');
  fs.writeFileSync(yamlPath, yamlContent);
  return yamlPath;
}

/**
 * Create skill-rules.json with custom config
 */
export function createSkillRulesJson(tmpDir: string, config: Partial<SkillConfig>): string {
  const skillsDir = path.join(tmpDir, '.claude', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });

  const fullConfig: SkillConfig = {
    version: config.version ?? '1.0',
    description: config.description ?? 'Test config',
    settings: config.settings,
    skills: config.skills ?? {},
  };

  const jsonPath = path.join(skillsDir, 'skill-rules.json');
  fs.writeFileSync(jsonPath, JSON.stringify(fullConfig, null, 2));
  return jsonPath;
}

/**
 * Create a skill directory with SKILL.md
 */
export function createSkill(tmpDir: string, skillName: string, content: string): string {
  const skillDir = path.join(tmpDir, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, content);
  return skillPath;
}

/**
 * Create corrupted session file for error handling tests
 */
export function createCorruptedSession(tmpDir: string, sessionId: string): string {
  const cacheDir = path.join(tmpDir, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const sessionPath = path.join(cacheDir, `session-${sessionId}.json`);
  fs.writeFileSync(sessionPath, '{ invalid json content');
  return sessionPath;
}

/**
 * Create valid session file with specific state
 */
export function createSession(
  tmpDir: string,
  sessionId: string,
  data: Partial<SessionData>
): string {
  const cacheDir = path.join(tmpDir, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  const sessionData: SessionData = {
    modifiedFiles: data.modifiedFiles ?? [],
    activeDomains: data.activeDomains ?? [],
    lastActivatedSkills: data.lastActivatedSkills ?? {},
    currentPromptSkills: data.currentPromptSkills ?? [],
    toolUseCount: data.toolUseCount ?? 0,
    createdAt: data.createdAt ?? Date.now(),
  };

  const sessionPath = path.join(cacheDir, `session-${sessionId}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  return sessionPath;
}

/**
 * Create a test file in the project
 */
export function createTestFile(tmpDir: string, relativePath: string, content: string): string {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

/**
 * Mock stdin with data
 * Note: vi.mock() calls are hoisted so we use spyOn instead
 */
export function mockStdin(data: string): void {
  const mockStream = Readable.from([data]);
  // @ts-expect-error mocking read-only property with partial stream implementation
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStream);
}

/**
 * Setup fake timers for time-dependent tests
 */
export function setupFakeTimers(isoDate = '2024-01-15T10:00:00Z'): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDate));
}

/**
 * Restore real timers
 */
export function restoreFakeTimers(): void {
  vi.useRealTimers();
}

/**
 * Simple YAML generator (avoids importing js-yaml in tests)
 */
function generateYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    // quote strings that could be interpreted as other types
    if (obj.includes(':') || obj.includes('#') || obj.includes('\n') || obj === '') {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const nested = generateYaml(item, indent + 1);
        const lines = nested.split('\n');
        return `${spaces}- ${lines[0]}\n${lines.slice(1).map(l => `${spaces}  ${l}`).join('\n')}`.trimEnd();
      }
      return `${spaces}- ${generateYaml(item, indent)}`;
    }).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `${spaces}${key}:\n${generateYaml(value, indent + 1)}`;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) return `${spaces}${key}: []`;
        return `${spaces}${key}:\n${generateYaml(value, indent + 1)}`;
      }
      return `${spaces}${key}: ${generateYaml(value, indent)}`;
    }).join('\n');
  }

  // fallback for remaining types (symbol, bigint, function)
  return typeof obj === 'function' ? '[Function]' : String(obj as string | number | boolean | symbol | bigint);
}

/**
 * Default test skill rule
 */
export const defaultSkillRule: SkillRule = {
  type: 'domain',
  enforcement: 'suggest',
  priority: 'medium',
  description: 'Test skill',
};

/**
 * Create a minimal valid skill config
 */
export function createMinimalConfig(skills: Record<string, SkillRule> = {}): SkillConfig {
  return {
    version: '1.0',
    description: 'Test config',
    skills,
  };
}
