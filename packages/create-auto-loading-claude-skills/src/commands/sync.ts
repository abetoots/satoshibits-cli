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
import os from "os";
import path from "path";

import type { SmartTriggers } from "../parsers/frontmatter-parser.js";
import type { SyncMetadata, SyncOptions } from "../types/index.js";
import type { SkillConfig, SkillRule } from "@satoshibits/claude-skill-runtime";

import {
  inferSkillName,
  parseFrontmatter,
  smartTriggersToSkillRule,
} from "../parsers/frontmatter-parser.js";
import { skillExists } from "../utils/skill-paths.js";

/**
 * Extended SkillConfig with sync metadata for tracking auto-synced vs manual skills
 */
interface SkillRulesConfig extends Omit<SkillConfig, "description"> {
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
 * Skill file with scope information
 */
interface SkillFile {
  path: string;
  scope: "personal" | "project";
}

/**
 * Find all SKILL.md files in ~/.claude/skills/ (personal) and <root>/.claude/skills/
 * (project). Project skills take precedence over personal skills with the same name.
 *
 * Pure discovery: no console output, so read-only callers (sync-status) stay silent.
 * `legacyCommandsCount` reports SKILL.md files left under the deprecated `.claude/commands/`
 * location so the caller can advise the user; nothing there is synced.
 */
async function findSkillFiles(
  rootDir: string,
): Promise<{ files: SkillFile[]; legacyCommandsCount: number }> {
  const results: SkillFile[] = [];

  // 1. personal scope: ~/.claude/skills/
  const personalDir = path.join(os.homedir(), ".claude", "skills");
  if (fs.existsSync(personalDir)) {
    const personalPatterns = [
      path.join(personalDir, "**/SKILL.md"),
      path.join(personalDir, "**/skill.md"),
    ];
    for (const pattern of personalPatterns) {
      const matches = await glob(pattern, { nocase: true });
      results.push(...matches.map((p) => ({ path: p, scope: "personal" as const })));
    }
  }

  // 2. project scope (takes precedence). `.claude/skills/` ONLY — it is what `init`
  // creates, what `validate` checks, and what the runtime's ConfigLoader reads. The
  // deprecated `.claude/commands/` is NOT synced: no reader resolves content there, so a
  // rule generated from it always reported as orphaned and never loaded. Files left there
  // are counted and surfaced by the caller, not silently synced.
  const projectSkillsDir = path.join(rootDir, ".claude", "skills");
  if (fs.existsSync(projectSkillsDir)) {
    for (const pattern of [
      path.join(projectSkillsDir, "**/SKILL.md"),
      path.join(projectSkillsDir, "**/skill.md"),
    ]) {
      const matches = await glob(pattern, { nocase: true });
      results.push(...matches.map((p) => ({ path: p, scope: "project" as const })));
    }
  }

  const legacyCommandsDir = path.join(rootDir, ".claude", "commands");
  const legacyCommandsCount = fs.existsSync(legacyCommandsDir)
    ? (await glob(path.join(legacyCommandsDir, "**/SKILL.md"), { nocase: true })).length
    : 0;

  // dedupe by path and sort
  const seen = new Set<string>();
  const files = results
    .filter((f) => {
      if (seen.has(f.path)) return false;
      seen.add(f.path);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return { files, legacyCommandsCount };
}

/** Advise about SKILL.md files left under the deprecated `.claude/commands/` location. */
function reportLegacyCommands(count: number): void {
  console.log(
    chalk.yellow(
      `\n⚠️  ${count} SKILL.md file(s) found under .claude/commands/ — not synced.\n` +
        `   Move them to .claude/skills/<name>/SKILL.md to be resolvable.\n`,
    ),
  );
}

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

  // Writing personal (~/.claude) skills into a PROJECT config breaks them: the runtime
  // resolves a skill's SKILL.md only from the scope that declared it, so a
  // project-declared copy of a personal skill points at <project>/.claude/skills/<name>,
  // which does not exist — and, because project wins collisions, it also shadows the
  // working user-scope entry. That scope isolation is deliberate: a project config is
  // untrusted data, so it must not be able to name a file under $HOME. When syncing a
  // project, emit project skills only.
  const userSkillsDir = path.join(os.homedir(), ".claude", "skills");
  const syncingUserScope =
    path.resolve(skillsDir) === path.resolve(userSkillsDir);
  /** personal skills deliberately not written into a project config (see above) */
  const skippedPersonal: string[] = [];

  // 1. find skill files from both personal and project scopes
  const spinner = ora("Scanning for SKILL.md files...").start();
  const { files: skillFiles, legacyCommandsCount } = await findSkillFiles(cwd);

  if (skillFiles.length === 0) {
    spinner.warn(
      "No SKILL.md files found in ~/.claude/skills/ or <project>/.claude/skills/",
    );

    // If a synced config already exists, keep going with an empty rule set so the stale
    // entries are cleared. Returning here left `sync-status` permanently stale after the
    // last SKILL.md was deleted, with `sync` refusing to repair it.
    const priorConfig = loadExistingConfig(configPath);
    if (!priorConfig?._sync) {
      if (legacyCommandsCount > 0) reportLegacyCommands(legacyCommandsCount);
      console.log(
        chalk.dim("Create skills using: cl-auto-skills add-skill <name>"),
      );
      return;
    }

    console.log(
      chalk.dim("Clearing previously synced entries from skill-rules.yaml"),
    );
  }

  const personalCount = skillFiles.filter((f) => f.scope === "personal").length;
  const projectCount = skillFiles.filter((f) => f.scope === "project").length;
  spinner.succeed(
    `Found ${skillFiles.length} skill file(s)` +
      (personalCount > 0 ? chalk.dim(` (${personalCount} personal, ${projectCount} project)`) : ""),
  );

  if (legacyCommandsCount > 0) reportLegacyCommands(legacyCommandsCount);

  // 2. load existing config
  const existingConfig = loadExistingConfig(configPath);
  const existingSkills = existingConfig?.skills ?? {};
  const syncMetadata = existingConfig?._sync;
  const manualSkills = new Set(syncMetadata?.manualSkills ?? []);

  // 3. parse each skill file
  const result: SyncResult = {
    synced: [],
    skipped: [],
    errors: [],
    preserved: [],
  };

  const syncedRules: Record<string, Partial<SkillRule>> = {};
  // track which scope each skill came from for precedence
  const skillScopes: Record<string, "personal" | "project"> = {};

  for (const skillFile of skillFiles) {
    const { path: filePath, scope } = skillFile;
    const relativePath = scope === "personal"
      ? path.relative(os.homedir(), filePath)
      : path.relative(cwd, filePath);

    if (verbose) {
      console.log(chalk.dim(`  Parsing ${relativePath} (${scope})...`));
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

    // handle scope precedence: project skills override personal skills
    const existingScope = skillScopes[skillName];
    if (existingScope === "project" && scope === "personal") {
      // project already has this skill, skip personal version
      if (verbose) {
        console.log(chalk.dim(`    Skipped (project scope takes precedence)`));
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

    // if personal skill is being overridden by project skill, remove from synced list first
    if (existingScope === "personal" && scope === "project") {
      const idx = result.synced.indexOf(skillName);
      if (idx !== -1) result.synced.splice(idx, 1);
    }

    if (scope === "personal" && !syncingUserScope) {
      // belongs in ~/.claude/skills/skill-rules.yaml, not in this project's config.
      // tracked separately so the summary does not claim the frontmatter is missing
      skippedPersonal.push(skillName);
      if (verbose) {
        console.log(
          chalk.dim(`    Skipped (personal scope — sync from your home dir instead)`),
        );
      }
      continue;
    }

    syncedRules[skillName] = rule;
    skillScopes[skillName] = scope;
    result.synced.push(skillName);

    if (verbose) {
      console.log(
        chalk.green(
          `    ✓ ${skillName} (${rule.activationStrategy ?? "native_only"}, ${scope})`,
        ),
      );
    }
  }

  // 4. merge with existing config
  const mergedSkills: Record<string, SkillRule> = {};
  const newManualSkills: string[] = [];
  /** previously-synced personal entries removed from a project config (migration) */
  const droppedPersonal: string[] = [];
  /** previously-synced entries whose SKILL.md no longer exists */
  const droppedStale: string[] = [];
  /**
   * Previously-synced entries whose SKILL.md is still present but produced no rule this
   * run (parse error / triggers removed). Preserved AND kept sync-owned, so a later
   * genuine deletion still triggers the stale-drop instead of the rule lingering forever.
   */
  const preservedSyncOwned: string[] = [];

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
    } else if (
      !syncingUserScope &&
      syncMetadata?.skillScopes?.[name] === "personal"
    ) {
      // MIGRATION: a previous release copied personal skills into this project config.
      // Their SKILL.md lives under $HOME, never under the project, so the runtime cannot
      // resolve them and — because project rules win collisions — they shadow the working
      // user-scope skill. Always drop them from a project config.
      droppedPersonal.push(name);
    } else if (
      syncMetadata?.skillScopes?.[name] &&
      !skillExists(skillsDir, name)
    ) {
      // Previously synced, and its SKILL.md is genuinely GONE (not merely unparseable or
      // stripped of triggers — those still exist on disk). Drop it so a deleted skill's
      // generated rule doesn't linger forever. Same existence predicate `validate` uses.
      droppedStale.push(name);
    } else if (syncMetadata?.skillScopes?.[name]) {
      // Previously synced, file still present but produced no rule this run (parse error /
      // triggers removed). Preserve the rule, but keep it SYNC-OWNED — carrying its prior
      // scope forward (below) — so a later genuine deletion still drops it. Demoting it to
      // "manual" here would permanently defeat the stale-drop for that skill.
      mergedSkills[name] = rule;
      preservedSyncOwned.push(name);
      skillScopes[name] = syncMetadata.skillScopes[name];
      result.preserved.push(name);
    } else {
      // Genuinely hand-written (no sync metadata): preserve as a manual entry.
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
      // keep transiently-broken synced skills in the sync-owned set so their scope
      // metadata survives and a later deletion still drops them
      syncedSkills: [...Object.keys(syncedRules), ...preservedSyncOwned],
      manualSkills: newManualSkills,
      skillScopes,
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

  if (droppedStale.length > 0) {
    console.log(
      chalk.yellow(
        `⊘ ${dryRun ? "Would remove" : "Removed"} ${droppedStale.length} stale ` +
          `entr(y/ies) — their SKILL.md no longer exists`,
      ),
    );
    if (verbose) {
      droppedStale.forEach((s) => console.log(chalk.dim(`    ${s}`)));
    }
  }

  if (droppedPersonal.length > 0) {
    console.log(
      chalk.yellow(
        `⊘ ${dryRun ? "Would remove" : "Removed"} ${droppedPersonal.length} personal ` +
          `skill(s) previously copied into this project's config — they live in ` +
          `~/.claude/skills and are resolved from there`,
      ),
    );
    if (verbose) {
      droppedPersonal.forEach((s) => console.log(chalk.dim(`    ${s}`)));
    }
  }

  if (skippedPersonal.length > 0) {
    console.log(
      chalk.yellow(
        `⊘ Skipped: ${skippedPersonal.length} personal skill(s) — run sync from your ` +
          `home directory to write ~/.claude/skills/skill-rules.yaml`,
      ),
    );
    if (verbose) {
      skippedPersonal.forEach((s) => console.log(chalk.dim(`    ${s}`)));
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

  // find current skill files and compute checksum (read-only: no legacy notice here)
  const { files: skillFiles } = await findSkillFiles(rootDir);
  const currentRules: Record<string, Partial<SkillRule>> = {};
  const skillScopes: Record<string, "personal" | "project"> = {};

  // must mirror syncCommand's scope rule exactly — including personal skills here while
  // sync excludes them would report "stale" the instant after a clean sync
  const statusUserSkillsDir = path.join(os.homedir(), ".claude", "skills");
  const statusSyncingUserScope =
    path.resolve(skillsDir) === path.resolve(statusUserSkillsDir);

  for (const skillFile of skillFiles) {
    const { path: filePath, scope } = skillFile;
    if (scope === "personal" && !statusSyncingUserScope) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = parseFrontmatter(content, filePath);

    if (parsed.success && parsed.frontmatter?.smartTriggers) {
      const skillName =
        parsed.frontmatter.standard.name ?? inferSkillName(filePath);

      // apply same scope precedence as syncCommand: project wins
      const existingScope = skillScopes[skillName];
      if (existingScope === "project" && scope === "personal") {
        continue;
      }

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
      skillScopes[skillName] = scope;
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
