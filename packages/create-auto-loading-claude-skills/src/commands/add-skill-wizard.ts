import chalk from "chalk";
import yaml from "js-yaml";
// eslint-disable-next-line import-x/no-named-as-default -- prompts library exports default function named 'prompts'
import prompts from "prompts";
import fs from "fs";
import path from "path";

import type { WizardOptions } from "../types/index.js";
import type { SkillConfig, SkillRule } from "@satoshibits/claude-skill-runtime";

interface WizardAnswers {
  skillType: "domain" | "workflow" | "strategic";
  imposesProcess: boolean;
  signalToNoise: "high" | "medium" | "low";
  resourceIntensive: boolean;
}

interface SkillClassification {
  recommendation: "auto-load" | "manual-only" | "shadow";
  type: "domain" | "guardrail" | "workflow";
  enforcement: "suggest" | "warn" | "block" | "manual";
  generateTriggers: boolean;
  generateShadowTriggers: boolean;
  reason?: string;
}

/**
 * Trigger configuration from wizard prompts
 */
interface TriggerConfig {
  keywords: string[];
  filePatterns: string[];
  intentPatterns: string[];
  isShadow: boolean;
}

/**
 * Interactive wizard for skill classification and configuration
 *
 * Guides users through determining whether a skill should be AUTO-LOAD or MANUAL-ONLY
 * based on the multi-model consensus design principles.
 */
export async function addSkillWizardCommand(
  skillName: string,
  options: WizardOptions = {},
) {
  const cwd = process.cwd();
  const skillsDir = path.join(cwd, ".claude", "skills");
  const skillDir = path.join(skillsDir, skillName);

  console.log(chalk.blue.bold("\n🧙 Skill Classification Wizard\n"));
  console.log(
    chalk.dim("This wizard helps determine the optimal loading strategy.\n"),
  );

  // check if skill already exists
  if (fs.existsSync(path.join(skillDir, "SKILL.md"))) {
    console.log(chalk.yellow(`⚠️  Skill '${skillName}' already exists.`));
    const { proceed } = (await prompts({
      type: "confirm",
      name: "proceed",
      message: "Would you like to update its classification?",
      initial: false,
    })) as { proceed: boolean | undefined };

    if (!proceed) {
      console.log(chalk.dim("\nAborted.\n"));
      return;
    }
  }

  // if forced flags are set, skip classification
  let classification: SkillClassification;

  if (options.forceAutoLoad) {
    classification = {
      recommendation: "auto-load",
      type: "domain",
      enforcement: "suggest",
      generateTriggers: true,
      generateShadowTriggers: false,
      reason: "Forced via --auto-load flag",
    };
  } else if (options.forceManual) {
    classification = {
      recommendation: "manual-only",
      type: "workflow",
      enforcement: "manual",
      generateTriggers: false,
      generateShadowTriggers: false,
      reason: "Forced via --manual flag",
    };
  } else if (options.skipClassification) {
    // default to manual-only when skipping
    classification = {
      recommendation: "manual-only",
      type: "workflow",
      enforcement: "manual",
      generateTriggers: false,
      generateShadowTriggers: false,
      reason: "Classification skipped",
    };
  } else {
    // run the classification wizard
    const answers = await runClassificationQuestions();
    if (!answers) {
      console.log(chalk.dim("\nAborted.\n"));
      return;
    }
    classification = classifySkill(answers);
  }

  // display classification result
  displayClassificationResult(classification);

  // prompt for confirmation
  const { confirm } = (await prompts({
    type: "confirm",
    name: "confirm",
    message: `Proceed with ${classification.recommendation} configuration?`,
    initial: true,
  })) as { confirm: boolean | undefined };

  if (!confirm) {
    // offer alternative
    const { alternative } = (await prompts({
      type: "select",
      name: "alternative",
      message: "What would you like to do instead?",
      choices: [
        { title: "Use AUTO-LOAD anyway", value: "auto-load" },
        { title: "Use MANUAL-ONLY anyway", value: "manual-only" },
        { title: "Use SHADOW triggers (suggest only)", value: "shadow" },
        { title: "Cancel", value: "cancel" },
      ],
    })) as {
      alternative:
        | "auto-load"
        | "manual-only"
        | "shadow"
        | "cancel"
        | undefined;
    };

    if (alternative === "cancel" || alternative === undefined) {
      console.log(chalk.dim("\nAborted.\n"));
      return;
    }

    classification = adjustClassification(classification, alternative);
  }

  // generate triggers if needed
  let triggerConfig: TriggerConfig | null = null;

  if (
    classification.generateTriggers ||
    classification.generateShadowTriggers
  ) {
    triggerConfig = await promptForTriggers(
      skillName,
      classification.generateTriggers,
      classification.generateShadowTriggers,
    );

    if (!triggerConfig) {
      console.log(chalk.dim("\nAborted.\n"));
      return;
    }
  }

  // generate skill rule
  const skillRule = generateSkillRule(skillName, classification, triggerConfig);

  // display generated config
  console.log(chalk.dim("\n📋 Generated skill-rules.yaml entry:\n"));
  console.log(chalk.cyan(yaml.dump({ [skillName]: skillRule })));

  // confirm and save
  const { save } = (await prompts({
    type: "confirm",
    name: "save",
    message: "Add to skill-rules.yaml?",
    initial: true,
  })) as { save: boolean | undefined };

  if (save) {
    saveSkillRule(skillName, skillRule, skillsDir);
    console.log(chalk.green(`\n✓ Added ${skillName} to skill-rules.yaml`));

    // display next steps
    console.log(chalk.dim("\nNext steps:"));
    if (classification.recommendation === "manual-only") {
      console.log(
        chalk.dim(
          `  1. Users can invoke via: /${skillName} or explicit request`,
        ),
      );
      if (classification.generateShadowTriggers) {
        console.log(
          chalk.dim(`  2. Suggestions will appear when shadow triggers match`),
        );
      }
    } else {
      console.log(chalk.dim(`  1. Skill will auto-load when triggers match`));
      console.log(chalk.dim(`  2. Test by asking Claude about related topics`));
    }
    console.log(
      chalk.dim(`  3. Review: .claude/skills/${skillName}/SKILL.md\n`),
    );
  } else {
    console.log(chalk.dim("\nConfiguration not saved.\n"));
  }
}

/**
 * Run the classification questionnaire
 */
async function runClassificationQuestions(): Promise<WizardAnswers | null> {
  console.log(chalk.dim("Please answer a few questions about this skill:\n"));

  const answers = (await prompts([
    {
      type: "select",
      name: "skillType",
      message: "What type of skill is this?",
      choices: [
        {
          title: "Domain knowledge / Linter / Quality gate",
          value: "domain",
          description: "Provides context, rules, or static analysis",
        },
        {
          title: "Workflow / Methodology / Process",
          value: "workflow",
          description: "Guides through specific steps or procedures",
        },
        {
          title: "Strategic decision tool",
          value: "strategic",
          description: "Helps with architectural or design choices",
        },
      ],
    },
    {
      type: "confirm",
      name: "imposesProcess",
      message: "Does this skill impose a multi-step process on the user?",
      initial: false,
      hint: "No = provides context/rules passively; Yes = guides through specific steps",
    },
    {
      type: "select",
      name: "signalToNoise",
      message:
        "How would you describe the signal-to-noise ratio when auto-triggered?",
      choices: [
        {
          title: "High",
          value: "high",
          description: "Triggers are precise, rarely unwanted",
        },
        {
          title: "Medium",
          value: "medium",
          description: "Sometimes useful, sometimes noise",
        },
        {
          title: "Low",
          value: "low",
          description: "Only valuable when explicitly requested",
        },
      ],
    },
    {
      type: "confirm",
      name: "resourceIntensive",
      message: "Does this skill require significant resources?",
      initial: false,
      hint: "Subagents, external model calls, long-running processes",
    },
  ])) as Partial<WizardAnswers>;

  // check if all questions were answered
  if (
    answers.skillType === undefined ||
    answers.imposesProcess === undefined ||
    answers.signalToNoise === undefined ||
    answers.resourceIntensive === undefined
  ) {
    return null;
  }

  return answers as WizardAnswers;
}

/**
 * Classify skill based on wizard answers
 *
 * Design principles from multi-model consensus:
 * - AUTO-LOAD: Declarative knowledge, static analysis, high signal, lightweight
 * - MANUAL-ONLY: Imperative workflows, multi-step processes, low signal, resource-heavy
 */
function classifySkill(answers: WizardAnswers): SkillClassification {
  const { skillType, imposesProcess, signalToNoise, resourceIntensive } =
    answers;

  // domain + passive + high signal + lightweight = AUTO-LOAD
  if (
    skillType === "domain" &&
    !imposesProcess &&
    signalToNoise === "high" &&
    !resourceIntensive
  ) {
    return {
      recommendation: "auto-load",
      type: "domain",
      enforcement: "suggest",
      generateTriggers: true,
      generateShadowTriggers: false,
    };
  }

  // domain + passive + medium signal = AUTO-LOAD with caution
  if (
    skillType === "domain" &&
    !imposesProcess &&
    signalToNoise === "medium" &&
    !resourceIntensive
  ) {
    return {
      recommendation: "auto-load",
      type: "domain",
      enforcement: "suggest",
      generateTriggers: true,
      generateShadowTriggers: false,
      reason: "Medium signal - consider refining trigger patterns",
    };
  }

  // borderline cases -> SHADOW triggers
  if (
    (skillType === "domain" && signalToNoise === "low") ||
    (skillType === "workflow" && signalToNoise === "high" && !resourceIntensive)
  ) {
    return {
      recommendation: "shadow",
      type: skillType === "domain" ? "domain" : "workflow",
      enforcement: "manual",
      generateTriggers: false,
      generateShadowTriggers: true,
      reason:
        skillType === "domain"
          ? "Low signal ratio - using shadow triggers for non-intrusive suggestions"
          : "Workflow skill with high signal - using shadow triggers for opt-in suggestions",
    };
  }

  // workflow OR multi-step OR low signal OR resource-heavy = MANUAL-ONLY
  return {
    recommendation: "manual-only",
    type: skillType === "strategic" ? "workflow" : skillType,
    enforcement: "manual",
    generateTriggers: false,
    generateShadowTriggers: false,
    reason: getManualOnlyReason(answers),
  };
}

/**
 * Get reason for manual-only classification
 */
function getManualOnlyReason(answers: WizardAnswers): string {
  const reasons: string[] = [];

  if (answers.skillType === "workflow" || answers.skillType === "strategic") {
    reasons.push("workflow/process-based skill");
  }
  if (answers.imposesProcess) {
    reasons.push("imposes multi-step process");
  }
  if (answers.signalToNoise === "low") {
    reasons.push("low signal-to-noise ratio");
  }
  if (answers.resourceIntensive) {
    reasons.push("resource-intensive");
  }

  return reasons.join(", ");
}

/**
 * Display classification result
 */
function displayClassificationResult(
  classification: SkillClassification,
): void {
  console.log("");

  const emoji =
    classification.recommendation === "auto-load"
      ? "🟢"
      : classification.recommendation === "shadow"
        ? "🟡"
        : "🔴";

  const label =
    classification.recommendation === "auto-load"
      ? "AUTO-LOAD"
      : classification.recommendation === "shadow"
        ? "SHADOW TRIGGERS"
        : "MANUAL-ONLY";

  console.log(chalk.bold(`${emoji} Recommendation: ${label}`));

  if (classification.reason) {
    console.log(chalk.dim(`   Reason: ${classification.reason}`));
  }

  console.log("");

  if (classification.recommendation === "auto-load") {
    console.log(
      chalk.dim("This skill will auto-load when trigger patterns match."),
    );
    console.log(
      chalk.dim("You'll be prompted to define keywords and file patterns."),
    );
  } else if (classification.recommendation === "shadow") {
    console.log(
      chalk.dim("This skill will suggest itself when patterns match,"),
    );
    console.log(
      chalk.dim("but won't auto-load. Users can opt-in if interested."),
    );
  } else {
    console.log(
      chalk.dim("This skill will only activate when explicitly requested."),
    );
    console.log(chalk.dim("Users invoke via /skill-name or direct request."));
  }

  console.log("");
}

/**
 * Adjust classification based on user override
 */
function adjustClassification(
  original: SkillClassification,
  override: string,
): SkillClassification {
  switch (override) {
    case "auto-load":
      return {
        ...original,
        recommendation: "auto-load",
        enforcement: "suggest",
        generateTriggers: true,
        generateShadowTriggers: false,
      };
    case "manual-only":
      return {
        ...original,
        recommendation: "manual-only",
        enforcement: "manual",
        generateTriggers: false,
        generateShadowTriggers: false,
      };
    case "shadow":
      return {
        ...original,
        recommendation: "shadow",
        enforcement: "manual",
        generateTriggers: false,
        generateShadowTriggers: true,
      };
    default:
      return original;
  }
}

/**
 * Prompt for trigger configuration
 */
async function promptForTriggers(
  skillName: string,
  _generatePromptTriggers: boolean,
  generateShadowTriggers: boolean,
): Promise<TriggerConfig | null> {
  const triggerType = generateShadowTriggers ? "shadow" : "prompt";

  console.log(
    chalk.dim(`\n📝 Configure ${triggerType} triggers for ${skillName}:\n`),
  );

  const { keywords, filePatterns, intentPatterns } = (await prompts([
    {
      type: "text",
      name: "keywords",
      message: `Enter keywords that should trigger this skill (comma-separated):`,
      initial: guessKeywords(skillName),
      validate: (value: string) =>
        value.length > 0 ? true : "At least one keyword required",
    },
    {
      type: "text",
      name: "filePatterns",
      message: "File patterns to match (glob, comma-separated, or empty):",
      initial: "",
    },
    {
      type: "text",
      name: "intentPatterns",
      message: "Intent patterns (regex, comma-separated, or empty):",
      initial: "",
    },
  ])) as {
    keywords: string | undefined;
    filePatterns: string | undefined;
    intentPatterns: string | undefined;
  };

  if (keywords === undefined) {
    return null;
  }

  const keywordList = keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const filePatternList = filePatterns
    ? filePatterns
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const intentPatternList = intentPatterns
    ? intentPatterns
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return {
    keywords: keywordList,
    filePatterns: filePatternList,
    intentPatterns: intentPatternList,
    isShadow: generateShadowTriggers,
  };
}

/**
 * Generate skill rule configuration
 */
function generateSkillRule(
  skillName: string,
  classification: SkillClassification,
  triggerConfig: TriggerConfig | null,
): SkillRule {
  const rule: SkillRule = {
    type: classification.type,
    enforcement: classification.enforcement,
    priority: classification.recommendation === "auto-load" ? "medium" : "low",
    description: `${skillName.split("-").join(" ")} skill`,
  };

  // add prompt triggers
  if (triggerConfig && !triggerConfig.isShadow) {
    rule.promptTriggers = {
      keywords: triggerConfig.keywords,
    };
    if (triggerConfig.intentPatterns.length > 0) {
      rule.promptTriggers.intentPatterns = triggerConfig.intentPatterns;
    }

    // add file triggers
    if (triggerConfig.filePatterns.length > 0) {
      rule.fileTriggers = {
        pathPatterns: triggerConfig.filePatterns,
      };
    }
  }

  // add shadow triggers
  if (triggerConfig?.isShadow) {
    rule.shadowTriggers = {
      keywords: triggerConfig.keywords,
    };
    if (triggerConfig.intentPatterns.length > 0) {
      rule.shadowTriggers.intentPatterns = triggerConfig.intentPatterns;
    }
  }

  return rule;
}

/**
 * Save skill rule to skill-rules.yaml (YAML is the single source of truth)
 */
function saveSkillRule(
  skillName: string,
  skillRule: SkillRule,
  skillsDir: string,
): void {
  const schemaUrl =
    "https://raw.githubusercontent.com/satoshibits-cli/packages/create-auto-loading-claude-skills/main/schema/skill-rules.schema.json";
  const yamlPath = path.join(skillsDir, "skill-rules.yaml");
  const jsonPath = path.join(skillsDir, "skill-rules.json");

  const yamlExists = fs.existsSync(yamlPath);
  const jsonExists = fs.existsSync(jsonPath);

  let config: SkillConfig;

  if (!yamlExists && !jsonExists) {
    // create new config
    config = {
      version: "1.0",
      description: "Auto-activation rules for Claude Code skills",
      settings: {
        maxSuggestions: 3,
        cacheDirectory: ".claude/cache",
        enableDebugLogging: false,
      },
      skills: {
        [skillName]: skillRule,
      },
    };
  } else if (yamlExists) {
    // yaml exists - use it as source of truth
    const content = fs.readFileSync(yamlPath, "utf8");
    config = yaml.load(content) as SkillConfig;
    if (!config.skills) {
      config.skills = {};
    }
    config.skills[skillName] = skillRule;
  } else {
    // only json exists - migrate to yaml
    const content = fs.readFileSync(jsonPath, "utf8");
    // parse as generic object to handle legacy fields
    const rawConfig = JSON.parse(content) as Record<string, unknown>;
    // remove auto-generated metadata fields
    delete rawConfig._generated;
    delete rawConfig._generatedAt;
    delete rawConfig.$schema;
    config = rawConfig as unknown as SkillConfig;
    if (!config.skills) {
      config.skills = {};
    }
    config.skills[skillName] = skillRule;
  }

  // always write to yaml
  const yamlContent =
    `# yaml-language-server: $schema=${schemaUrl}\n` + yaml.dump(config);
  fs.writeFileSync(yamlPath, yamlContent, "utf8");

  // warn if deprecated JSON file exists
  if (jsonExists) {
    console.log(
      chalk.yellow(
        "\n⚠️  Deprecation: skill-rules.json is deprecated.\n" +
          "   YAML is now the canonical format. Your JSON config will still be read,\n" +
          "   but new changes will only be written to skill-rules.yaml.\n" +
          "   Consider removing skill-rules.json after verifying skill-rules.yaml is correct.\n",
      ),
    );
  }
}

/**
 * Guess keywords from skill name
 */
function guessKeywords(skillName: string): string {
  const words = skillName.split("-");

  const synonyms: Record<string, string[]> = {
    test: ["testing", "spec", "TDD"],
    frontend: ["UI", "component", "client"],
    backend: ["API", "server", "service"],
    dev: ["development", "coding"],
    planning: ["plan", "strategy"],
    security: ["auth", "authentication"],
    performance: ["optimization", "speed"],
    debug: ["debugging", "troubleshoot"],
    review: ["code review", "PR"],
  };

  const expanded = words.flatMap((word) => {
    const lower = word.toLowerCase();
    return synonyms[lower] ? [word, ...synonyms[lower].slice(0, 2)] : [word];
  });

  return expanded.join(", ");
}
