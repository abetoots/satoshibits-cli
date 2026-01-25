/**
 * Frontmatter parser for SKILL.md files
 *
 * Parses YAML frontmatter from skill files, extracting both standard
 * Claude Code skill metadata and custom x-smart-triggers for the
 * reliability engine.
 */

import yaml from "js-yaml";

import type { ActivationStrategy, SkillRule } from "@satoshibits/claude-skill-runtime";

/**
 * Standard Claude Code skill frontmatter fields
 */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  hooks?: {
    type: "script" | "prompt";
    when: "PreToolUse" | "PostToolUse" | "Stop" | "SessionStart";
    run?: string;
    prompt?: string;
  }[];
}

/**
 * Custom x-smart-triggers frontmatter for reliability engine
 */
export interface SmartTriggers {
  activationStrategy?: ActivationStrategy;
  promptTriggers?: {
    keywords?: string[];
    intentPatterns?: string[];
  };
  fileTriggers?: {
    pathPatterns?: string[];
    contentPatterns?: string[];
  };
  shadowTriggers?: {
    keywords?: string[];
    intentPatterns?: string[];
  };
  preToolTriggers?: {
    toolName: string;
    inputPatterns?: string[];
  };
  stopTriggers?: {
    keywords?: string[];
    promptEvaluation?: string;
  };
  cooldownMinutes?: number;
  promptHook?: string;
}

/**
 * Combined parsed frontmatter result
 */
export interface ParsedSkillFrontmatter {
  /** Standard Claude Code skill fields */
  standard: SkillFrontmatter;
  /** Custom x-smart-triggers for reliability engine */
  smartTriggers?: SmartTriggers;
  /** Raw frontmatter object for extension */
  raw: Record<string, unknown>;
}

/**
 * Result of parsing a skill file
 */
export interface SkillParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed frontmatter (if success) */
  frontmatter?: ParsedSkillFrontmatter;
  /** Skill content after frontmatter */
  content?: string;
  /** Error message (if failed) */
  error?: string;
  /** File path that was parsed */
  filePath: string;
}

/**
 * Frontmatter delimiter pattern (---\n...---\n)
 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/**
 * Parse YAML frontmatter from a skill file content
 *
 * @param content - Raw file content
 * @param filePath - File path for error messages
 * @returns Parsed result with frontmatter and content
 */
export function parseFrontmatter(
  content: string,
  filePath: string,
): SkillParseResult {
  const match = FRONTMATTER_REGEX.exec(content);

  if (!match) {
    // no frontmatter found - valid skill file without metadata
    return {
      success: true,
      frontmatter: {
        standard: {},
        raw: {},
      },
      content: content.trim(),
      filePath,
    };
  }

  try {
    const yamlContent = match[1]!;
    const raw = yaml.load(yamlContent) as Record<string, unknown>;

    if (typeof raw !== "object" || raw === null) {
      return {
        success: false,
        error: "Frontmatter must be a YAML object",
        filePath,
      };
    }

    // extract standard fields
    const standard: SkillFrontmatter = {
      name: typeof raw.name === "string" ? raw.name : undefined,
      description:
        typeof raw.description === "string" ? raw.description : undefined,
      "disable-model-invocation":
        typeof raw["disable-model-invocation"] === "boolean"
          ? raw["disable-model-invocation"]
          : undefined,
      hooks: Array.isArray(raw.hooks)
        ? (raw.hooks as SkillFrontmatter["hooks"])
        : undefined,
    };

    // extract x-smart-triggers
    const smartTriggersRaw = raw["x-smart-triggers"];
    let smartTriggers: SmartTriggers | undefined;

    if (smartTriggersRaw && typeof smartTriggersRaw === "object") {
      smartTriggers = parseSmartTriggers(
        smartTriggersRaw as Record<string, unknown>,
      );
    }

    // remaining content after frontmatter
    const remainingContent = content.slice(match[0].length).trim();

    return {
      success: true,
      frontmatter: {
        standard,
        smartTriggers,
        raw,
      },
      content: remainingContent,
      filePath,
    };
  } catch (error) {
    return {
      success: false,
      error: `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
    };
  }
}

/**
 * Parse x-smart-triggers object with validation
 */
function parseSmartTriggers(raw: Record<string, unknown>): SmartTriggers {
  const triggers: SmartTriggers = {};

  // activationStrategy
  if (typeof raw.activationStrategy === "string") {
    const valid: ActivationStrategy[] = [
      "guaranteed",
      "suggestive",
      "prompt_enhanced",
      "native_only",
    ];
    if (valid.includes(raw.activationStrategy as ActivationStrategy)) {
      triggers.activationStrategy =
        raw.activationStrategy as ActivationStrategy;
    }
  }

  // promptTriggers
  if (raw.promptTriggers && typeof raw.promptTriggers === "object") {
    const pt = raw.promptTriggers as Record<string, unknown>;
    triggers.promptTriggers = {
      keywords: Array.isArray(pt.keywords)
        ? pt.keywords.filter((k): k is string => typeof k === "string")
        : undefined,
      intentPatterns: Array.isArray(pt.intentPatterns)
        ? pt.intentPatterns.filter((p): p is string => typeof p === "string")
        : undefined,
    };
  }

  // fileTriggers
  if (raw.fileTriggers && typeof raw.fileTriggers === "object") {
    const ft = raw.fileTriggers as Record<string, unknown>;
    triggers.fileTriggers = {
      pathPatterns: Array.isArray(ft.pathPatterns)
        ? ft.pathPatterns.filter((p): p is string => typeof p === "string")
        : undefined,
      contentPatterns: Array.isArray(ft.contentPatterns)
        ? ft.contentPatterns.filter((p): p is string => typeof p === "string")
        : undefined,
    };
  }

  // shadowTriggers
  if (raw.shadowTriggers && typeof raw.shadowTriggers === "object") {
    const st = raw.shadowTriggers as Record<string, unknown>;
    triggers.shadowTriggers = {
      keywords: Array.isArray(st.keywords)
        ? st.keywords.filter((k): k is string => typeof k === "string")
        : undefined,
      intentPatterns: Array.isArray(st.intentPatterns)
        ? st.intentPatterns.filter((p): p is string => typeof p === "string")
        : undefined,
    };
  }

  // preToolTriggers
  if (raw.preToolTriggers && typeof raw.preToolTriggers === "object") {
    const ptt = raw.preToolTriggers as Record<string, unknown>;
    if (typeof ptt.toolName === "string") {
      triggers.preToolTriggers = {
        toolName: ptt.toolName,
        inputPatterns: Array.isArray(ptt.inputPatterns)
          ? ptt.inputPatterns.filter((p): p is string => typeof p === "string")
          : undefined,
      };
    }
  }

  // stopTriggers
  if (raw.stopTriggers && typeof raw.stopTriggers === "object") {
    const stt = raw.stopTriggers as Record<string, unknown>;
    triggers.stopTriggers = {
      keywords: Array.isArray(stt.keywords)
        ? stt.keywords.filter((k): k is string => typeof k === "string")
        : undefined,
      promptEvaluation:
        typeof stt.promptEvaluation === "string"
          ? stt.promptEvaluation
          : undefined,
    };
  }

  // cooldownMinutes
  if (typeof raw.cooldownMinutes === "number" && raw.cooldownMinutes >= 0) {
    triggers.cooldownMinutes = raw.cooldownMinutes;
  }

  // promptHook
  if (typeof raw.promptHook === "string") {
    triggers.promptHook = raw.promptHook;
  }

  return triggers;
}

/**
 * Convert SmartTriggers to SkillRule format for skill-rules.yaml
 *
 * @param triggers - Parsed smart triggers
 * @param description - Skill description (from standard frontmatter or fallback)
 * @returns Partial SkillRule for merging
 */
export function smartTriggersToSkillRule(
  triggers: SmartTriggers,
  description: string,
): Partial<SkillRule> {
  const rule: Partial<SkillRule> = {
    description,
    activationStrategy: triggers.activationStrategy,
    cooldownMinutes: triggers.cooldownMinutes,
    promptHook: triggers.promptHook,
  };

  if (triggers.promptTriggers) {
    rule.promptTriggers = triggers.promptTriggers;
  }

  if (triggers.fileTriggers) {
    rule.fileTriggers = triggers.fileTriggers;
  }

  if (triggers.shadowTriggers) {
    rule.shadowTriggers = triggers.shadowTriggers;
  }

  if (triggers.preToolTriggers) {
    rule.preToolTriggers = triggers.preToolTriggers;
  }

  if (triggers.stopTriggers) {
    rule.stopTriggers = triggers.stopTriggers;
  }

  return rule;
}

/**
 * Infer skill name from file path if not in frontmatter
 *
 * @param filePath - Path to skill file
 * @returns Inferred skill name
 */
export function inferSkillName(filePath: string): string {
  // extract directory name from path like .claude/commands/my-skill/SKILL.md
  const parts = filePath.split(/[/\\]/);
  const fileName = parts[parts.length - 1] ?? "";

  // if the file is named SKILL.md (case-insensitive), use the parent directory
  if (fileName.toLowerCase() === "skill.md" && parts.length > 1) {
    return parts[parts.length - 2] ?? fileName.replace(/\.md$/i, "");
  }

  // fallback to filename without extension
  return fileName.replace(/\.md$/i, "");
}
