import chalk from "chalk";
import yaml from "js-yaml";
// eslint-disable-next-line import-x/no-named-as-default -- prompts library exports default function named 'prompts'
import prompts from "prompts";
import fs from "fs";
import path from "path";

import type { ValidateOptions } from "../types/index.js";
import { skillExists } from "../utils/skill-paths.js";
import type { SkillConfig, SkillRule } from "@satoshibits/claude-skill-runtime";

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  skillName: string;
  message: string;
  suggestion?: string;
}

export async function validateCommand(options: ValidateOptions) {
  console.log(chalk.blue.bold("\n🔍 Validating skill configuration...\n"));

  const cwd = process.cwd();
  const skillsDir = path.join(cwd, ".claude", "skills");

  // 1. Check if .claude/skills exists
  if (!fs.existsSync(skillsDir)) {
    console.log(chalk.red("❌ Error: .claude/skills/ directory not found"));
    console.log(chalk.dim("   Run: npx cl-auto-skills init\n"));
    process.exit(1);
  }

  // 2. Load skill-rules configuration
  const config = loadSkillRules(skillsDir);

  if (config && (typeof config !== "object" || Array.isArray(config))) {
    console.log(
      chalk.red("❌ Error: skill-rules must be a mapping at the top level"),
    );
    console.log(
      chalk.dim(`   Parsed as ${Array.isArray(config) ? "an array" : typeof config}\n`),
    );
    process.exit(1);
  }

  if (!config) {
    console.log(chalk.red("❌ Error: No skill-rules configuration found"));
    console.log(
      chalk.dim("   Expected: skill-rules.yaml or skill-rules.json\n"),
    );
    process.exit(1);
  }

  // 3. Collect all validation issues
  const issues: ValidationIssue[] = [];

  // The `skills:` block has three distinct states. A present-but-malformed block (scalar
  // or list) must be reported as an ERROR and never rewritten — `config` is the object
  // autoFixIssues serializes to disk, so coercing `config.skills = {}` here would silently
  // destroy the user's data. An ABSENT block is safely normalized to an empty mapping.
  const skillsAbsent = config.skills === undefined || config.skills === null;
  const skillsBlockValid =
    !skillsAbsent &&
    typeof config.skills === "object" &&
    !Array.isArray(config.skills);
  /** present, but not a mapping — rewriting the file would discard the user's data */
  const skillsBlockMalformed = !skillsAbsent && !skillsBlockValid;

  if (skillsBlockMalformed) {
    issues.push({
      severity: "error",
      skillName: "(root)",
      message: `\`skills:\` must be a mapping — parsed as ${
        Array.isArray(config.skills) ? "a list" : typeof config.skills
      }`,
      suggestion: "Use `skills:` with one nested entry per skill name",
    });
  }

  if (skillsAbsent) {
    // absent is not malformed: normalizing to an empty mapping discards nothing and lets
    // auto-fix register discovered skills
    config.skills = {};
  }

  const skills: Record<string, unknown> = skillsBlockMalformed
    ? {}
    : (config.skills as unknown as Record<string, unknown>);

  // Malformed rules are RECORDED, not deleted: `config` is the same object autoFixIssues
  // serializes back to disk, so deleting here silently dropped the user's rule while the
  // output told them to fix it manually.
  const malformedRules = new Set<string>();
  for (const [skillName, rule] of Object.entries(skills)) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      malformedRules.add(skillName);
      issues.push({
        severity: "error",
        skillName,
        message: "Rule is empty — expected a mapping of settings",
        suggestion: "Give the skill at least type, enforcement, priority and description",
      });
    }
  }

  // 3a. Check for orphaned skills (in yaml but no SKILL.md)
  const orphanedSkills: string[] = [];
  const validSkills: string[] = [];

  for (const skillName of Object.keys(skills)) {
    if (malformedRules.has(skillName)) continue; // already reported above
    if (skillExists(skillsDir, skillName)) {
      validSkills.push(skillName);
    } else {
      orphanedSkills.push(skillName);
      issues.push({
        severity: "error",
        skillName,
        message: "Referenced in skill-rules but SKILL.md not found",
        suggestion: "Remove from skill-rules or create SKILL.md",
      });
    }
  }

  // 3b. Check for unregistered skills (SKILL.md exists but not in yaml)
  const unregisteredSkills: string[] = [];

  if (fs.existsSync(skillsDir)) {
    const dirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dir of dirs) {
      if (!skills[dir] && skillExists(skillsDir, dir)) {
        unregisteredSkills.push(dir);
        issues.push({
          severity: "warning",
          skillName: dir,
          message: "SKILL.md exists but not registered in skill-rules",
          suggestion: "Add to skill-rules.yaml with appropriate triggers",
        });
      }
    }
  }

  // 3c. Validate trigger configurations
  for (const [skillName, rule] of Object.entries(skills)) {
    if (malformedRules.has(skillName)) continue; // no shape to validate
    const triggerIssues = validateTriggers(skillName, rule as SkillRule);
    issues.push(...triggerIssues);
  }

  // 4. Display validation results
  console.log(chalk.bold("Validation Results:\n"));

  if (validSkills.length > 0) {
    console.log(chalk.green(`✓ ${validSkills.length} valid skill(s):`));
    validSkills.forEach((skill) => {
      console.log(chalk.dim(`  - ${skill}`));
    });
    console.log("");
  }

  // group issues by severity
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  let hasIssues = false;

  if (errors.length > 0) {
    hasIssues = true;
    console.log(chalk.red(`❌ ${errors.length} error(s):`));
    errors.forEach((issue) => {
      console.log(chalk.red(`  - ${issue.skillName}: ${issue.message}`));
      if (issue.suggestion && options.verbose) {
        console.log(chalk.dim(`    Suggestion: ${issue.suggestion}`));
      }
    });
    console.log("");
  }

  if (warnings.length > 0) {
    hasIssues = true;
    console.log(chalk.yellow(`⚠️  ${warnings.length} warning(s):`));
    warnings.forEach((issue) => {
      console.log(chalk.yellow(`  - ${issue.skillName}: ${issue.message}`));
      if (issue.suggestion && options.verbose) {
        console.log(chalk.dim(`    Suggestion: ${issue.suggestion}`));
      }
    });
    console.log("");
  }

  if (infos.length > 0 && options.verbose) {
    console.log(chalk.blue(`ℹ️  ${infos.length} info(s):`));
    infos.forEach((issue) => {
      console.log(chalk.dim(`  - ${issue.skillName}: ${issue.message}`));
    });
    console.log("");
  }

  if (!hasIssues) {
    console.log(chalk.green("✨ All skills are properly configured!\n"));
    return;
  }

  // 5. Auto-fix if requested
  if (options.fix && skillsBlockMalformed) {
    console.log(
      chalk.red(
        "\n❌ Refusing to auto-fix: the `skills:` block is not a mapping, and rewriting\n" +
          "   the file would discard it. Fix the block by hand first.\n",
      ),
    );
    process.exitCode = 1;
  } else if (options.fix) {
    // Exit status is derived from what auto-fix ACTUALLY removed. The prompts are
    // interactive: with stdin closed (any CI runner) they abort and nothing is repaired,
    // so assuming the orphaned rules were deleted would exit 0 over an untouched config.
    const { removedSkills, addedSkills } = await autoFixIssues(
      config,
      orphanedSkills,
      unregisteredSkills,
      skillsDir,
      options.yes === true,
    );
    // Count an error as resolved only if auto-fix ACTUALLY removed the rule or registered
    // the skill — a declined prompt or non-TTY early return leaves both sets empty, so
    // nothing is falsely counted. `removedSkills` is the load-bearing term today (added
    // skills are unregistered → warnings, never errors); `addedSkills` is included for
    // correctness so this stays right if an error is ever attached to an added name.
    const repaired = new Set([...removedSkills, ...addedSkills]);
    const remainingErrors = errors.filter(
      (issue) => !repaired.has(issue.skillName),
    );
    if (remainingErrors.length > 0) {
      console.log(
        chalk.red(
          `\n❌ ${remainingErrors.length} error(s) remain after auto-fix — edit skill-rules manually.\n`,
        ),
      );
      process.exitCode = 1;
    }
  } else {
    console.log(
      chalk.dim(
        `Run with ${chalk.cyan("--fix")} to automatically resolve issues`,
      ),
    );
    console.log(
      chalk.dim(
        `Run with ${chalk.cyan("--verbose")} for detailed suggestions\n`,
      ),
    );

    // errors must fail the process so `validate` can gate a commit or CI job;
    // warnings stay non-fatal. Auto-fix runs report their own outcome instead.
    if (errors.length > 0) {
      process.exitCode = 1;
    }
  }
}

/**
 * Load skill-rules configuration (yaml or json)
 */
function loadSkillRules(skillsDir: string): SkillConfig | null {
  const yamlPath = path.join(skillsDir, "skill-rules.yaml");
  const jsonPath = path.join(skillsDir, "skill-rules.json");

  // prefer yaml
  if (fs.existsSync(yamlPath)) {
    try {
      const content = fs.readFileSync(yamlPath, "utf8");
      return yaml.load(content) as SkillConfig;
    } catch (error) {
      console.log(chalk.red("❌ Error parsing skill-rules.yaml"));
      if (error instanceof Error) {
        console.log(chalk.dim(`   ${error.message}\n`));
      }
      process.exit(1);
    }
  }

  // fallback to json
  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, "utf8");
      return JSON.parse(content) as SkillConfig;
    } catch (error) {
      console.log(chalk.red("❌ Error parsing skill-rules.json"));
      if (error instanceof Error) {
        console.log(chalk.dim(`   ${error.message}\n`));
      }
      process.exit(1);
    }
  }

  return null;
}


/**
 * Validate trigger configurations for a skill
 */
function validateTriggers(
  skillName: string,
  rule: SkillRule,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // check for empty triggers on auto-load skills
  if (rule.enforcement !== "manual") {
    // NOTE: these are boolean ORs, not `??`. They previously used `??`, which does not
    // evaluate its right side when the left is `false` — so `keywords: []` combined with
    // real `intentPatterns` was wrongly reported as having no triggers. Operands are
    // reduced to strict booleans so the intent is unambiguous.
    const hasPromptTriggers =
      (rule.promptTriggers?.keywords?.length ?? 0) > 0 ||
      (rule.promptTriggers?.intentPatterns?.length ?? 0) > 0;
    const hasFileTriggers =
      (rule.fileTriggers?.pathPatterns?.length ?? 0) > 0 ||
      (rule.fileTriggers?.contentPatterns?.length ?? 0) > 0;
    const hasPreToolTriggers = Boolean(rule.preToolTriggers?.toolName);
    const hasStopTriggers =
      (rule.stopTriggers?.keywords?.length ?? 0) > 0 ||
      Boolean(rule.stopTriggers?.promptEvaluation);

    if (
      !hasPromptTriggers &&
      !hasFileTriggers &&
      !hasPreToolTriggers &&
      !hasStopTriggers
    ) {
      issues.push({
        severity: "warning",
        skillName,
        message: "Auto-load skill has no triggers defined",
        suggestion:
          "Add promptTriggers, fileTriggers, preToolTriggers, or stopTriggers",
      });
    }
  }

  // check for manual-only skills with auto-load triggers
  if (rule.enforcement === "manual") {
    const hasAutoLoadTriggers =
      rule.promptTriggers ??
      rule.fileTriggers ??
      rule.preToolTriggers ??
      rule.stopTriggers;

    if (hasAutoLoadTriggers && !rule.shadowTriggers) {
      issues.push({
        severity: "info",
        skillName,
        message: "Manual skill has triggers but no shadowTriggers",
        suggestion:
          "Consider using shadowTriggers instead for non-intrusive suggestions",
      });
    }
  }

  // validate regex patterns
  if (rule.promptTriggers?.intentPatterns) {
    for (const pattern of rule.promptTriggers.intentPatterns) {
      try {
        new RegExp(pattern, "i");
      } catch {
        issues.push({
          severity: "error",
          skillName,
          message: `Invalid regex in promptTriggers.intentPatterns: ${pattern}`,
          suggestion: "Fix the regex pattern syntax",
        });
      }
    }
  }

  if (rule.fileTriggers?.contentPatterns) {
    for (const pattern of rule.fileTriggers.contentPatterns) {
      try {
        new RegExp(pattern, "i");
      } catch {
        issues.push({
          severity: "error",
          skillName,
          message: `Invalid regex in fileTriggers.contentPatterns: ${pattern}`,
          suggestion: "Fix the regex pattern syntax",
        });
      }
    }
  }

  if (rule.shadowTriggers?.intentPatterns) {
    for (const pattern of rule.shadowTriggers.intentPatterns) {
      try {
        new RegExp(pattern, "i");
      } catch {
        issues.push({
          severity: "error",
          skillName,
          message: `Invalid regex in shadowTriggers.intentPatterns: ${pattern}`,
          suggestion: "Fix the regex pattern syntax",
        });
      }
    }
  }

  if (rule.preToolTriggers?.inputPatterns) {
    for (const pattern of rule.preToolTriggers.inputPatterns) {
      try {
        new RegExp(pattern, "i");
      } catch {
        issues.push({
          severity: "error",
          skillName,
          message: `Invalid regex in preToolTriggers.inputPatterns: ${pattern}`,
          suggestion: "Fix the regex pattern syntax",
        });
      }
    }
  }

  // validate type and enforcement combinations
  const validTypes = ["domain", "guardrail", "workflow"];
  const validEnforcements = ["suggest", "warn", "block", "manual"];
  const validPriorities = ["critical", "high", "medium", "low"];

  if (rule.type && !validTypes.includes(rule.type)) {
    issues.push({
      severity: "error",
      skillName,
      message: `Invalid skill type: ${rule.type}`,
      suggestion: `Use one of: ${validTypes.join(", ")}`,
    });
  }

  if (rule.enforcement && !validEnforcements.includes(rule.enforcement)) {
    issues.push({
      severity: "error",
      skillName,
      message: `Invalid enforcement: ${rule.enforcement}`,
      suggestion: `Use one of: ${validEnforcements.join(", ")}`,
    });
  }

  if (rule.priority && !validPriorities.includes(rule.priority)) {
    issues.push({
      severity: "error",
      skillName,
      message: `Invalid priority: ${rule.priority}`,
      suggestion: `Use one of: ${validPriorities.join(", ")}`,
    });
  }

  // activationStrategy has an enum in the schema but was never checked here. An
  // unrecognized value (e.g. "imperative") falls through the hook's switch to the
  // native_only branch, so the skill silently never surfaces — the exact failure this
  // engine exists to prevent.
  const validStrategies = [
    "guaranteed",
    "suggestive",
    "prompt_enhanced",
    "native_only",
  ];
  if (
    rule.activationStrategy &&
    !validStrategies.includes(rule.activationStrategy)
  ) {
    issues.push({
      severity: "error",
      skillName,
      message: `Invalid activationStrategy: ${rule.activationStrategy}`,
      suggestion: `Use one of: ${validStrategies.join(", ")} — unrecognized values are treated as native_only and never fire`,
    });
  }

  // required fields — schema/skill-rules.schema.json marks these required, but nothing
  // executed the schema, so a rule missing them used to validate clean and then silently
  // fail to display at runtime (the matcher scores it, the renderer drops it).
  // Deliberately hand-rolled rather than pulling in ajv: this keeps the CLI dependency-free
  // and the messages actionable. The JSON schema stays the authority for editor autocomplete.
  const requiredFields: (keyof SkillRule)[] = [
    "type",
    "enforcement",
    "priority",
    "description",
  ];
  for (const field of requiredFields) {
    const value = rule[field];
    if (value === undefined || value === null || value === "") {
      issues.push({
        severity: "error",
        skillName,
        message: `Missing required field: ${field}`,
        suggestion:
          field === "description"
            ? "Add a one-line description of when the skill applies"
            : `Add ${field} (see schema/skill-rules.schema.json for allowed values)`,
      });
    }
  }

  // unknown keys — usually a casing mistake (activation_strategy vs activationStrategy,
  // prompt_triggers vs promptTriggers). The schema is additionalProperties:false, so these
  // are silently ignored at runtime and the skill never fires.
  const knownKeys = new Set([
    "activationStrategy",
    "cooldownMinutes",
    "description",
    "enforcement",
    "fileTriggers",
    "preToolTriggers",
    "priority",
    "promptHook",
    "promptTriggers",
    "shadowTriggers",
    "stopTriggers",
    "type",
    "validationRules",
  ]);
  for (const key of Object.keys(rule)) {
    if (knownKeys.has(key)) continue;
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    issues.push({
      severity: "warning",
      skillName,
      message: `Unknown field: ${key} (ignored at runtime)`,
      suggestion: knownKeys.has(camel)
        ? `Did you mean "${camel}"?`
        : `Remove it, or check schema/skill-rules.schema.json for valid fields`,
    });
  }

  return issues;
}

/**
 * Auto-fix issues
 */
async function autoFixIssues(
  config: SkillConfig,
  orphanedSkills: string[],
  unregisteredSkills: string[],
  skillsDir: string,
  assumeYes = false,
): Promise<{
  removedSkills: Set<string>;
  addedSkills: Set<string>;
  modified: boolean;
}> {
  console.log(chalk.bold("🔧 Auto-fix mode:\n"));

  let modified = false;
  const removedSkills = new Set<string>();
  const addedSkills = new Set<string>();

  // Every repair is gated behind an interactive confirm. With stdin closed — any CI
  // runner — `prompts` aborts and terminates the process from inside the prompt, so
  // nothing is repaired AND no later code runs. Detect that up front instead.
  if (!assumeYes && !process.stdin.isTTY) {
    console.log(
      chalk.yellow(
        "⚠️  --fix requires an interactive terminal (stdin is not a TTY).\n" +
          "   Re-run interactively, pass --yes to apply repairs unattended, or edit\n" +
          "   skill-rules manually. Nothing was changed.\n",
      ),
    );
    return { removedSkills, addedSkills, modified };
  }

  /** With --yes, repairs apply unattended; otherwise each is confirmed interactively. */
  const confirm = async (message: string): Promise<boolean> => {
    if (assumeYes) return true;
    const { ok } = (await prompts({
      type: "confirm",
      name: "ok",
      message,
      initial: true,
    })) as { ok?: boolean };
    return ok === true;
  };

  // Remove orphaned references
  if (orphanedSkills.length > 0) {
    const confirmRemove = await confirm(
      `Remove ${orphanedSkills.length} orphaned skill reference(s) from skill-rules?`,
    );

    if (confirmRemove) {
      orphanedSkills.forEach((skillName) => {
        delete config.skills[skillName];
        removedSkills.add(skillName);
        console.log(chalk.green(`  ✓ Removed: ${skillName}`));
      });
      modified = true;
    }
  }

  // Add unregistered skills
  if (unregisteredSkills.length > 0) {
    const confirmAdd = await confirm(
      `Add ${unregisteredSkills.length} unregistered skill(s) to skill-rules?`,
    );

    if (confirmAdd) {
      for (const skillName of unregisteredSkills) {
        config.skills[skillName] = {
          type: "domain",
          enforcement: "suggest",
          priority: "medium",
          description: `Auto-added: ${skillName}`,
          promptTriggers: {
            keywords: [skillName.replace(/-/g, " ")],
          },
          fileTriggers: {
            pathPatterns: [],
            contentPatterns: [],
          },
          validationRules: [],
        };
        addedSkills.add(skillName);
        console.log(chalk.green(`  ✓ Added: ${skillName}`));
      }
      modified = true;
    }
  }

  // Save updated config (YAML is single source of truth)
  if (modified) {
    const yamlPath = path.join(skillsDir, "skill-rules.yaml");
    const jsonPath = path.join(skillsDir, "skill-rules.json");
    const schemaUrl =
      "https://raw.githubusercontent.com/satoshibits-cli/packages/create-auto-loading-claude-skills/main/schema/skill-rules.schema.json";

    // write yaml only
    const yamlContent =
      `# yaml-language-server: $schema=${schemaUrl}\n` + yaml.dump(config);
    fs.writeFileSync(yamlPath, yamlContent, "utf8");
    console.log(chalk.green("\n✓ Updated: skill-rules.yaml"));

    // warn if deprecated JSON file exists
    if (fs.existsSync(jsonPath)) {
      console.log(
        chalk.yellow(
          "\n⚠️  Deprecation: skill-rules.json is deprecated.\n" +
            "   YAML is now the canonical format. Your JSON config will still be read,\n" +
            "   but new changes will only be written to skill-rules.yaml.\n" +
            "   Consider removing skill-rules.json after verifying skill-rules.yaml is correct.\n",
        ),
      );
    }

    console.log(chalk.green("\n✨ Issues fixed successfully!\n"));
  } else {
    console.log(chalk.dim("\nNo changes made.\n"));
  }

  return { removedSkills, addedSkills, modified };
}
