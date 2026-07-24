/**
 * Config Loader - loads and parses skill rules configuration
 * Supports both JSON and YAML formats with YAML as the preferred format
 */

import yaml from "js-yaml";
import fs from "fs";
import os from "os";
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
/**
 * Merge user-scope settings with project-scope settings, key by key.
 *
 * Replacing the whole block when a project defines any settings would silently drop a
 * user's global preferences: a project setting only `enableDebugLogging` would wipe their
 * `maxSuggestions` and thresholds. Nested `scoring` / `thresholds` are merged one level
 * deeper for the same reason. Project values win on every conflict.
 */
function mergeSettings(
  user: SkillConfig["settings"] | undefined,
  project: SkillConfig["settings"] | undefined,
): SkillConfig["settings"] | undefined {
  if (!user) return project;
  if (!project) return user;

  return {
    ...user,
    ...project,
    ...(user.scoring || project.scoring
      ? { scoring: { ...user.scoring, ...project.scoring } }
      : {}),
    ...(user.thresholds || project.thresholds
      ? { thresholds: { ...user.thresholds, ...project.thresholds } }
      : {}),
  } as SkillConfig["settings"];
}

export interface ConfigLoaderOptions {
  /**
   * Also read user-level rules from ~/.claude/skills/ and merge them beneath project rules.
   * Default false, so existing project-only behavior is unchanged.
   */
  userScope?: boolean;
}

/** Outcome of reading one scope's skill-rules file. */
type ScopeLoad =
  | { status: "ok"; config: SkillConfig }
  | { status: "absent" }
  | { status: "error" };

export class ConfigLoader {
  private skillsDir: string;
  /** User-level skills dir (~/.claude/skills), set only when userScope is enabled. */
  private userSkillsDir: string | null = null;
  /**
   * Which scope declared each skill. Content is resolved ONLY from the declaring scope:
   * a project's skill-rules.yaml arrives with any cloned repo and is data, not reviewed
   * code, so letting it name a user-scope skill would let it read files out of $HOME.
   */
  private skillScopes = new Map<string, "project" | "user">();
  /**
   * Whether the scope map reflects a completed load. An EMPTY map is ambiguous — a config
   * with zero skills looks the same as "never loaded" — so `findSkillPath` used the size
   * alone and re-read both files on every call in the zero-skill case. This flag settles it.
   */
  private scopesLoaded = false;

  constructor(projectDir: string, options: ConfigLoaderOptions = {}) {
    this.skillsDir = path.join(projectDir, ".claude", "skills");

    if (options.userScope) {
      // resolve ~ explicitly — fs does not expand it
      const userSkillsDir = path.join(os.homedir(), ".claude", "skills");
      // skip when the project IS ~/.claude, so the same file isn't merged with itself
      if (path.resolve(userSkillsDir) !== path.resolve(this.skillsDir)) {
        this.userSkillsDir = userSkillsDir;
      }
    }
  }

  /**
   * Load skill-rules from either YAML or JSON
   * Returns default empty config if files don't exist or are invalid (graceful degradation)
   *
   * With userScope enabled, user rules load first and project rules are merged on top:
   * project wins on skill-name collision, and `settings` merge key by key with project
   * precedence (see mergeSettings).
   *
   * An UNPARSEABLE project file degrades to the empty default rather than silently
   * inheriting the entire user rule set — a typo in a project config must not swap in a
   * different set of active skills. An ABSENT project file is a normal "no project rules"
   * case and does merge user scope.
   */
  loadSkillRules(): SkillConfig {
    this.skillScopes.clear();
    this.scopesLoaded = true;

    const project = this.loadConfigFrom(this.skillsDir);
    const user = this.userSkillsDir
      ? this.loadConfigFrom(this.userSkillsDir)
      : ({ status: "absent" } as ScopeLoad);

    // a broken project file is a hard stop for merging: degrade to empty, not to user rules
    if (project.status === "error") return this.getDefaultConfig();

    if (project.status === "absent" && user.status !== "ok") {
      if (process.env.DEBUG) {
        console.warn(
          "⚠️  No skill-rules.yaml or skill-rules.json found, using empty config",
        );
      }
      return this.getDefaultConfig();
    }

    const projectConfig =
      project.status === "ok" ? this.ensureValidConfig(project.config) : null;
    const userConfig =
      user.status === "ok" ? this.ensureValidConfig(user.config) : null;

    for (const name of Object.keys(userConfig?.skills ?? {})) {
      this.skillScopes.set(name, "user");
    }
    for (const name of Object.keys(projectConfig?.skills ?? {})) {
      this.skillScopes.set(name, "project"); // project wins the collision
    }

    if (!userConfig) return this.ensureValidConfig(projectConfig);
    if (!projectConfig) return this.ensureValidConfig(userConfig);

    return this.ensureValidConfig({
      ...userConfig,
      ...projectConfig,
      // ensureValidConfig fills a placeholder description, so a project that never set
      // one would otherwise overwrite the user's real description with it
      description:
        (projectConfig.description === "Skill rules configuration"
          ? userConfig.description
          : projectConfig.description) ?? userConfig.description,
      settings: mergeSettings(userConfig.settings, projectConfig.settings),
      skills: { ...userConfig.skills, ...projectConfig.skills },
    });
  }

  /**
   * Load a skill-rules file from one directory, YAML preferred over JSON.
   *
   * Distinguishes "no file" from "file present but unparseable" — the caller must be able
   * to treat a broken config differently from an absent one.
   */
  private loadConfigFrom(dir: string): ScopeLoad {
    const candidates: [string, (p: string) => SkillConfig | undefined][] = [
      [path.join(dir, "skill-rules.yaml"), (p) => this.loadYAML(p)],
      [path.join(dir, "skill-rules.json"), (p) => this.loadJSON(p)],
    ];

    for (const [filePath, load] of candidates) {
      if (!fs.existsSync(filePath)) continue;
      try {
        const config = load(filePath);
        // an empty file parses to undefined; treat it as "present but says nothing"
        return config ? { status: "ok", config } : { status: "absent" };
      } catch (error) {
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Failed to parse ${path.basename(filePath)} in ${dir}, ignoring it: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return { status: "error" };
      }
    }

    return { status: "absent" };
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

    // ensure skills is a mapping. Array.isArray matters: a YAML sequence would otherwise
    // be iterated as rules named "0", "1", … — and validate rejects it, so the two must
    // agree on the shape they accept.
    if (
      !cfg.skills ||
      typeof cfg.skills !== "object" ||
      Array.isArray(cfg.skills)
    ) {
      cfg.skills = {};
    }

    // a bare `my-skill:` entry parses to null; every consumer immediately reads
    // properties off the rule, so drop malformed entries here rather than crashing
    // the hook that loaded them
    const skills = cfg.skills as Record<string, unknown>;
    for (const [name, rule] of Object.entries(skills)) {
      if (!rule || typeof rule !== "object") {
        if (process.env.DEBUG) {
          console.warn(`⚠️  Skill '${name}' has no configuration, ignoring it`);
        }
        delete skills[name];
      }
    }

    // ensure required fields exist
    cfg.version ??= "1.0";
    cfg.description ??= "Skill rules configuration";

    return cfg as unknown as SkillConfig;
  }

  /**
   * Load JSON configuration
   */
  private loadJSON(filePath: string): SkillConfig | undefined {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as SkillConfig | undefined;
  }

  /**
   * Load YAML configuration
   */
  private loadYAML(filePath: string): SkillConfig | undefined {
    const content = fs.readFileSync(filePath, "utf8");
    // use JSON_SCHEMA for safe deserialization (no arbitrary object instantiation)
    // note: an empty document yields undefined, not an object
    return yaml.load(content, { schema: yaml.JSON_SCHEMA }) as SkillConfig | undefined;
  }

  /**
   * Load skill content (returns null for graceful degradation)
   */
  loadSkillContent(skillName: string): string | null {
    const skillPath = this.findSkillPath(skillName);

    if (!skillPath) {
      // graceful degradation - return null instead of throwing
      if (process.env.DEBUG) {
        console.warn(`⚠️  Warning: Skill '${skillName}' not found in its declaring scope`);
      }
      return null;
    }

    return fs.readFileSync(skillPath, "utf8");
  }

  /**
   * Check if the skill's SKILL.md exists in the scope that declared it
   */
  skillExists(skillName: string): boolean {
    return this.findSkillPath(skillName) !== null;
  }

  /**
   * Resolve a skill's SKILL.md **in the scope that declared the rule**.
   *
   * Deliberately not a search across scopes. A project's skill-rules.yaml is untrusted
   * data that arrives with any cloned repo, so if it could name a user-scope skill the
   * hook would read and print a private file out of $HOME. A rule declared by the project
   * resolves only under the project; a rule declared by the user resolves only under
   * ~/.claude. Names absent from the merged config fall back to project scope.
   */
  private findSkillPath(skillName: string): string | null {
    // scope map is built by loadSkillRules; populate it once on demand so content lookup
    // is not order-dependent on the caller having loaded rules first. Guard on the loaded
    // flag, not map size — a zero-skill config would otherwise re-read both files every call
    if (!this.scopesLoaded && this.userSkillsDir) {
      this.loadSkillRules();
    }

    // reject traversal and path segments before touching the filesystem
    if (
      !skillName ||
      skillName.includes("..") ||
      skillName.includes("/") ||
      skillName.includes("\\") ||
      path.isAbsolute(skillName)
    ) {
      return null;
    }

    const scope = this.skillScopes.get(skillName);
    const dir =
      scope === "user" && this.userSkillsDir
        ? this.userSkillsDir
        : this.skillsDir;

    // Accept both `SKILL.md` and `skill.md`. Skills are discovered with a case-insensitive
    // glob, so on a case-sensitive filesystem a lowercase `skill.md` skill would sync and
    // validate cleanly but its content would never load here — "scored but silently never
    // surfaces", the exact failure the validation hardening exists to prevent.
    for (const file of ["SKILL.md", "skill.md"]) {
      const skillPath = path.join(dir, skillName, file);
      if (fs.existsSync(skillPath)) return skillPath;
    }
    return null;
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
