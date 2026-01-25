import chalk from "chalk";
import yaml from "js-yaml";
// eslint-disable-next-line import-x/no-named-as-default -- prompts library exports default function named 'prompts'
import prompts from "prompts";
import fs from "fs";
import path from "path";

import type { SkillConfig, SkillRule } from "@satoshibits/claude-skill-runtime";
import type { ValidateOptions } from "../types/index.js";

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
    console.log(
      chalk.dim("   Run: npx create-auto-loading-claude-skills init\n"),
    );
    process.exit(1);
  }

  // 2. Load skill-rules configuration
  const config = loadSkillRules(skillsDir);

  if (!config) {
    console.log(chalk.red("❌ Error: No skill-rules configuration found"));
    console.log(
      chalk.dim("   Expected: skill-rules.yaml or skill-rules.json\n"),
    );
    process.exit(1);
  }

  // 3. Collect all validation issues
  const issues: ValidationIssue[] = [];

  // 3a. Check for orphaned skills (in yaml but no SKILL.md)
  const orphanedSkills: string[] = [];
  const validSkills: string[] = [];

  for (const skillName of Object.keys(config.skills)) {
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
      if (!config.skills[dir] && skillExists(skillsDir, dir)) {
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
  for (const [skillName, rule] of Object.entries(config.skills)) {
    const triggerIssues = validateTriggers(skillName, rule);
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
  if (options.fix) {
    await autoFixIssues(config, orphanedSkills, unregisteredSkills, skillsDir);
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
 * Check if skill exists (SKILL.md file)
 */
function skillExists(skillsDir: string, skillName: string): boolean {
  const skillPath = path.join(skillsDir, skillName, "SKILL.md");
  return fs.existsSync(skillPath);
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
    const hasPromptTriggers =
      rule.promptTriggers &&
      ((rule.promptTriggers.keywords &&
        rule.promptTriggers.keywords.length > 0) ??
        (rule.promptTriggers.intentPatterns &&
          rule.promptTriggers.intentPatterns.length > 0));
    const hasFileTriggers =
      rule.fileTriggers &&
      ((rule.fileTriggers.pathPatterns &&
        rule.fileTriggers.pathPatterns.length > 0) ??
        (rule.fileTriggers.contentPatterns &&
          rule.fileTriggers.contentPatterns.length > 0));
    const hasPreToolTriggers = rule.preToolTriggers?.toolName;
    const hasStopTriggers =
      rule.stopTriggers &&
      ((rule.stopTriggers.keywords && rule.stopTriggers.keywords.length > 0) ??
        rule.stopTriggers.promptEvaluation);

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
) {
  console.log(chalk.bold("🔧 Auto-fix mode:\n"));

  let modified = false;

  // Remove orphaned references
  if (orphanedSkills.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { confirmRemove } = await prompts({
      type: "confirm",
      name: "confirmRemove",
      message: `Remove ${orphanedSkills.length} orphaned skill reference(s) from skill-rules?`,
      initial: true,
    });

    if (confirmRemove) {
      orphanedSkills.forEach((skillName) => {
        delete config.skills[skillName];
        console.log(chalk.green(`  ✓ Removed: ${skillName}`));
      });
      modified = true;
    }
  }

  // Add unregistered skills
  if (unregisteredSkills.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { confirmAdd } = await prompts({
      type: "confirm",
      name: "confirmAdd",
      message: `Add ${unregisteredSkills.length} unregistered skill(s) to skill-rules?`,
      initial: true,
    });

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
      "https://raw.githubusercontent.com/your-org/create-auto-loading-claude-skills/main/schema/skill-rules.schema.json";

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
}
