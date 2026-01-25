/**
 * Sync command - The "Compiler Pattern"
 *
 * Scans SKILL.md files for x-smart-triggers frontmatter and generates
 * skill-rules.yaml as a build artifact. This solves the "definition
 * separated from behavior" anti-pattern by:
 *
 * 1. Keeping trigger definitions co-located with skills (in SKILL.md)
 * 2. Generating centralized rules for the reliability engine
 *
 * Usage:
 *   claude-skills sync [options]
 *
 * Options:
 *   --dry-run    Show what would be synced without writing
 *   --verbose    Show detailed sync information
 *   --force      Overwrite manual entries (default: preserve)
 */

import chalk from "chalk";
import { glob } from "glob";
import yaml from "js-yaml";
import ora from "ora";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { SkillRule, SkillConfig } from "@satoshibits/claude-skill-runtime";
import type { SmartTriggers } from "../parsers/frontmatter-parser.js";
import type { SyncOptions, SyncMetadata } from "../types/index.js";

import {
  inferSkillName,
  parseFrontmatter,
  smartTriggersToSkillRule,
} from "../parsers/frontmatter-parser.js";

/**
 * Extended SkillConfig with sync metadata for tracking auto-synced vs manual skills
 */
interface SkillRulesConfig extends Omit<SkillConfig, 'description'> {
  description?: string;
  settings?: Record<string, unknown>;
  _sync?: SyncMetadata;
}

interface SyncResult {
  synced: string[];
  skipped: string[];
  errors: { skill: string; error: string }[];
  preserved: string[];
}

/**
 * Compute checksum for synced skills to detect stale config
 */
function computeChecksum(skills: Record<string, Partial<SkillRule>>): string {
  // sort skills by name for deterministic output
  const sortedSkills: Record<string, Partial<SkillRule>> = {};
  for (const key of Object.keys(skills).sort()) {
    sortedSkills[key] = skills[key]!;
  }
  // use stable stringification (sorted keys at all levels)
  const content = JSON.stringify(
    sortedSkills,
    (_, value: Record<string, unknown>) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // sort object keys for deterministic output
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value).sort()) {
          sorted[k] = value[k];
        }
        return sorted;
      }
      return value;
    },
  );
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

/**
 * Find all SKILL.md files in .claude/commands/
 */
async function findSkillFiles(rootDir: string): Promise<string[]> {
  const commandsDir = path.join(rootDir, ".claude", "commands");

  if (!fs.existsSync(commandsDir)) {
    return [];
  }

  // find all SKILL.md files (case-insensitive)
  const patterns = [
    path.join(commandsDir, "**/SKILL.md"),
    path.join(commandsDir, "**/skill.md"),
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { nocase: true });
    files.push(...matches);
  }

  // dedupe and sort
  return [...new Set(files)].sort();
}

/**
 * Load existing skill-rules.yaml
 */
function loadExistingConfig(configPath: string): SkillRulesConfig | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, "utf8");
    return yaml.load(content) as SkillRulesConfig;
  } catch {
    return null;
  }
}

/**
 * Main sync command
 */
export async function syncCommand(options: SyncOptions = {}): Promise<void> {
  const { dryRun = false, verbose = false, force = false } = options;

  console.log(chalk.blue.bold("\n🔄 Syncing skill triggers\n"));

  const cwd = process.cwd();
  const skillsDir = path.join(cwd, ".claude", "skills");
  const configPath = path.join(skillsDir, "skill-rules.yaml");

  // 1. find skill files
  const spinner = ora("Scanning for SKILL.md files...").start();
  const skillFiles = await findSkillFiles(cwd);

  if (skillFiles.length === 0) {
    spinner.warn("No SKILL.md files found in .claude/commands/");
    console.log(
      chalk.dim(
        "Create skills using: create-auto-loading-claude-skills add-skill <name>",
      ),
    );
    return;
  }

  spinner.succeed(`Found ${skillFiles.length} skill file(s)`);

  // 2. load existing config
  const existingConfig = loadExistingConfig(configPath);
  const existingSkills = existingConfig?.skills ?? {};
  const syncMetadata = existingConfig?._sync;
  const _previousSyncedSkills = new Set(syncMetadata?.syncedSkills ?? []);
  const manualSkills = new Set(syncMetadata?.manualSkills ?? []);

  // 3. parse each skill file
  const result: SyncResult = {
    synced: [],
    skipped: [],
    errors: [],
    preserved: [],
  };

  const syncedRules: Record<string, Partial<SkillRule>> = {};

  for (const filePath of skillFiles) {
    const relativePath = path.relative(cwd, filePath);

    if (verbose) {
      console.log(chalk.dim(`  Parsing ${relativePath}...`));
    }

    const content = fs.readFileSync(filePath, "utf8");
    const parsed = parseFrontmatter(content, filePath);

    if (!parsed.success) {
      result.errors.push({
        skill: relativePath,
        error: parsed.error ?? "Unknown parse error",
      });
      continue;
    }

    // extract skill name
    const skillName =
      parsed.frontmatter?.standard.name ?? inferSkillName(filePath);

    // check for x-smart-triggers
    const triggers = parsed.frontmatter?.smartTriggers;

    if (!triggers) {
      result.skipped.push(skillName);
      if (verbose) {
        console.log(chalk.dim(`    Skipped (no x-smart-triggers)`));
      }
      continue;
    }

    // convert to skill rule
    const description =
      parsed.frontmatter?.standard.description ?? `Skill: ${skillName}`;
    const rule = smartTriggersToSkillRule(triggers, description);

    // infer type/enforcement/priority from triggers if not in existing
    rule.type ??= inferSkillType(triggers);
    rule.enforcement ??= inferEnforcement(triggers);
    rule.priority ??= inferPriority(triggers);

    syncedRules[skillName] = rule;
    result.synced.push(skillName);

    if (verbose) {
      console.log(
        chalk.green(
          `    ✓ ${skillName} (${rule.activationStrategy ?? "native_only"})`,
        ),
      );
    }
  }

  // 4. merge with existing config
  const mergedSkills: Record<string, SkillRule> = {};
  const newManualSkills: string[] = [];

  // first, add all synced skills
  for (const [name, rule] of Object.entries(syncedRules)) {
    mergedSkills[name] = rule as SkillRule;
  }

  // then, preserve manual skills (those not synced from SKILL.md)
  for (const [name, rule] of Object.entries(existingSkills)) {
    if (syncedRules[name]) {
      // skill was synced, use synced version (but preserve manual additions)
      if (!force && manualSkills.has(name)) {
        // user manually edited this skill, preserve their changes
        mergedSkills[name] = { ...mergedSkills[name], ...rule };
        result.preserved.push(name);
      }
    } else {
      // skill not in SKILL.md files, preserve it as manual
      mergedSkills[name] = rule;
      newManualSkills.push(name);
      result.preserved.push(name);
    }
  }

  // 5. compute checksum for sync tracking
  const checksum = computeChecksum(syncedRules);

  // 6. build final config
  const finalConfig: SkillRulesConfig = {
    version: existingConfig?.version ?? "2.0",
    description:
      existingConfig?.description ??
      "Auto-generated by sync command. Manual entries preserved.",
    settings: existingConfig?.settings,
    skills: mergedSkills,
    _sync: {
      lastSync: new Date().toISOString(),
      checksum,
      syncedSkills: Object.keys(syncedRules),
      manualSkills: newManualSkills,
    },
  };

  // 7. output results
  console.log("");

  if (result.synced.length > 0) {
    console.log(chalk.green(`✓ Synced: ${result.synced.length} skill(s)`));
    if (verbose) {
      result.synced.forEach((s) => console.log(chalk.dim(`    ${s}`)));
    }
  }

  if (result.skipped.length > 0) {
    console.log(
      chalk.yellow(
        `⊘ Skipped: ${result.skipped.length} skill(s) (no x-smart-triggers)`,
      ),
    );
    if (verbose) {
      result.skipped.forEach((s) => console.log(chalk.dim(`    ${s}`)));
    }
  }

  if (result.preserved.length > 0) {
    console.log(
      chalk.blue(`◆ Preserved: ${result.preserved.length} manual skill(s)`),
    );
    if (verbose) {
      result.preserved.forEach((s) => console.log(chalk.dim(`    ${s}`)));
    }
  }

  if (result.errors.length > 0) {
    console.log(chalk.red(`✗ Errors: ${result.errors.length}`));
    result.errors.forEach((e) => {
      console.log(chalk.red(`    ${e.skill}: ${e.error}`));
    });
  }

  // 8. write config (unless dry-run)
  if (dryRun) {
    console.log(chalk.cyan("\n[Dry run] Would write to:"));
    console.log(chalk.dim(`  ${configPath}`));
    console.log(chalk.cyan("\nGenerated config:"));
    console.log(chalk.dim(yaml.dump(finalConfig, { lineWidth: 100 })));
  } else {
    // ensure directory exists
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    fs.writeFileSync(configPath, yaml.dump(finalConfig, { lineWidth: 100 }));
    console.log(
      chalk.green(`\n✓ Written to ${path.relative(cwd, configPath)}`),
    );
    console.log(chalk.dim(`  Checksum: ${checksum}`));
  }
}

/**
 * Infer skill type from triggers
 */
function inferSkillType(triggers: SmartTriggers): SkillRule["type"] {
  if (triggers.preToolTriggers) {
    return "guardrail";
  }
  if (triggers.stopTriggers) {
    return "workflow";
  }
  return "domain";
}

/**
 * Infer enforcement from activation strategy
 */
function inferEnforcement(triggers: SmartTriggers): SkillRule["enforcement"] {
  switch (triggers.activationStrategy) {
    case "guaranteed":
      return "block"; // guaranteed skills are critical
    case "suggestive":
      return "suggest";
    case "prompt_enhanced":
      return "warn";
    default:
      return "suggest";
  }
}

/**
 * Infer priority from activation strategy
 */
function inferPriority(triggers: SmartTriggers): SkillRule["priority"] {
  switch (triggers.activationStrategy) {
    case "guaranteed":
      return "critical";
    case "prompt_enhanced":
      return "high";
    case "suggestive":
      return "medium";
    default:
      return "low";
  }
}

/**
 * Check if skill-rules.yaml is stale (SKILL.md changed since last sync)
 */
export async function checkSyncStatus(
  rootDir: string = process.cwd(),
): Promise<{
  isStale: boolean;
  message: string;
}> {
  const skillsDir = path.join(rootDir, ".claude", "skills");
  const configPath = path.join(skillsDir, "skill-rules.yaml");

  // no config file means fresh start
  if (!fs.existsSync(configPath)) {
    return {
      isStale: false,
      message: "No skill-rules.yaml found. Run sync to generate.",
    };
  }

  const config = loadExistingConfig(configPath);
  const syncMetadata = config?._sync;

  // no sync metadata means manually created
  if (!syncMetadata) {
    return {
      isStale: false,
      message: "skill-rules.yaml was manually created (no sync metadata).",
    };
  }

  // find current skill files and compute checksum
  const skillFiles = await findSkillFiles(rootDir);
  const currentRules: Record<string, Partial<SkillRule>> = {};

  for (const filePath of skillFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = parseFrontmatter(content, filePath);

    if (parsed.success && parsed.frontmatter?.smartTriggers) {
      const skillName =
        parsed.frontmatter.standard.name ?? inferSkillName(filePath);
      const description =
        parsed.frontmatter.standard.description ?? `Skill: ${skillName}`;
      const rule = smartTriggersToSkillRule(
        parsed.frontmatter.smartTriggers,
        description,
      );

      // apply same inference logic as syncCommand for consistent checksums
      rule.type ??= inferSkillType(parsed.frontmatter.smartTriggers);
      rule.enforcement ??= inferEnforcement(parsed.frontmatter.smartTriggers);
      rule.priority ??= inferPriority(parsed.frontmatter.smartTriggers);
      currentRules[skillName] = rule;
    }
  }

  const currentChecksum = computeChecksum(currentRules);

  if (currentChecksum !== syncMetadata.checksum) {
    return {
      isStale: true,
      message: `skill-rules.yaml is stale (checksum mismatch). Run sync to update.`,
    };
  }

  return {
    isStale: false,
    message: `skill-rules.yaml is up to date (last sync: ${syncMetadata.lastSync}).`,
  };
}
