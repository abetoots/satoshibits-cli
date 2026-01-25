/**
 * Config Loader - loads and parses skill rules configuration
 * Supports both JSON and YAML formats with YAML as the preferred format
 */

import yaml from "js-yaml";
import fs from "fs";
import path from "path";

import type { DebugLogger, SkillConfig } from "./types.mjs";

import { createLogger, createNoopLogger } from "./debug-logger.mjs";

/**
 * Create a default empty skill configuration
 *
 * Used when no config file exists or when initializing a new project.
 * This is the single source of truth for default config values.
 */
export function createDefaultConfig(): SkillConfig {
  return {
    version: "1.0",
    description: "Auto-generated skill configuration",
    settings: {
      maxSuggestions: 3,
      cacheDirectory: ".claude/cache",
      enableDebugLogging: false,
      scoring: {
        keywordMatchScore: 10,
        intentPatternScore: 20,
        filePathMatchScore: 15,
        fileContentMatchScore: 15,
      },
      thresholds: {
        recentActivationMinutes: 5,
      },
    },
    skills: {},
  };
}

/**
 * Load and parse skill rules configuration
 * Supports both JSON and YAML formats
 */
export class ConfigLoader {
  private skillsDir: string;

  constructor(projectDir: string) {
    this.skillsDir = path.join(projectDir, ".claude", "skills");
  }

  /**
   * Load skill-rules from either YAML or JSON
   * Returns default empty config if files don't exist or are invalid (graceful degradation)
   */
  loadSkillRules(): SkillConfig {
    const yamlPath = path.join(this.skillsDir, "skill-rules.yaml");
    const jsonPath = path.join(this.skillsDir, "skill-rules.json");

    if (fs.existsSync(yamlPath)) {
      try {
        const config = this.loadYAML(yamlPath);
        return this.ensureValidConfig(config);
      } catch (error) {
        // gracefully fall back to default config on parse error
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Failed to parse skill-rules.yaml, using default config: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return this.getDefaultConfig();
      }
    } else if (fs.existsSync(jsonPath)) {
      try {
        const config = this.loadJSON(jsonPath);
        return this.ensureValidConfig(config);
      } catch (error) {
        // gracefully fall back to default config on parse error
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Failed to parse skill-rules.json, using default config: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return this.getDefaultConfig();
      }
    } else {
      // gracefully return empty config if no files found
      if (process.env.DEBUG) {
        console.warn(
          "⚠️  No skill-rules.yaml or skill-rules.json found, using empty config",
        );
      }
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default empty config
   */
  private getDefaultConfig(): SkillConfig {
    return createDefaultConfig();
  }

  /**
   * Ensure config has valid structure (handle missing/null skills)
   */
  private ensureValidConfig(config: unknown): SkillConfig {
    if (!config || typeof config !== "object") {
      return this.getDefaultConfig();
    }

    const cfg = config as Record<string, unknown>;

    // ensure skills object exists
    if (!cfg.skills || typeof cfg.skills !== "object") {
      cfg.skills = {};
    }

    // ensure required fields exist
    cfg.version ??= "1.0";
    cfg.description ??= "Skill rules configuration";

    return cfg as unknown as SkillConfig;
  }

  /**
   * Load JSON configuration
   */
  private loadJSON(filePath: string): SkillConfig {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as SkillConfig;
  }

  /**
   * Load YAML configuration
   */
  private loadYAML(filePath: string): SkillConfig {
    const content = fs.readFileSync(filePath, "utf8");
    // use JSON_SCHEMA for safe deserialization (no arbitrary object instantiation)
    return yaml.load(content, { schema: yaml.JSON_SCHEMA }) as SkillConfig;
  }

  /**
   * Load skill content (returns null for graceful degradation)
   */
  loadSkillContent(skillName: string): string | null {
    const skillPath = path.join(this.skillsDir, skillName, "SKILL.md");

    if (!fs.existsSync(skillPath)) {
      // graceful degradation - return null instead of throwing
      if (process.env.DEBUG) {
        console.warn(
          `⚠️  Warning: Skill '${skillName}' not found at ${skillPath}`,
        );
      }
      return null;
    }

    return fs.readFileSync(skillPath, "utf8");
  }

  /**
   * Check if skill exists
   */
  skillExists(skillName: string): boolean {
    const skillPath = path.join(this.skillsDir, skillName, "SKILL.md");
    return fs.existsSync(skillPath);
  }
}

/**
 * Helper to create a logger from config
 * Creates a no-op logger if debug logging is disabled
 */
export function getLogger(
  projectDir: string,
  config: SkillConfig,
): DebugLogger {
  const enabled = config.settings?.enableDebugLogging ?? false;
  const categories = config.settings?.debugCategories;

  if (!enabled) {
    return createNoopLogger();
  }

  return createLogger(projectDir, enabled, categories);
}
