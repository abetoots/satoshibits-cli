// eslint-disable-next-line import-x/no-named-as-default -- prompts library exports default function named 'prompts'
import prompts from "prompts";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

import {
  createDefaultConfig,
  type SkillRule,
  type SkillConfig,
} from "@satoshibits/claude-skill-runtime";
import type { AddSkillOptions } from "../types/index.js";
import { DocumentDiscovery } from "../utils/document-discovery.js";
import { FileWriter } from "../utils/file-writer.js";
import {
  DiscoveryCacheManager,
  type DocumentSuggestion,
} from "../utils/discovery-cache.js";
import {
  TemplateCatalog,
  type TemplateInfo,
} from "../utils/template-catalog.js";

/**
 * Choice item for prompts multiselect
 */
interface TemplateChoice {
  title: string;
  value: unknown;
  disabled?: boolean;
}

/**
 * Keyword match from document discovery
 */
interface KeywordMatch {
  path: string;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Existing resource info
 */
interface ExistingResource {
  name: string;
  isSymlink: boolean;
}

/**
 * Parse --var arguments into key-value object
 */
function parseVariables(varArgs: string[] = []): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const arg of varArgs) {
    const [key, ...valueParts] = arg.split('=');
    if (key && valueParts.length > 0) {
      variables[key.trim()] = valueParts.join('=').trim();
    }
  }

  return variables;
}

export async function addSkillCommand(
  skillName: string,
  options: AddSkillOptions
) {
  const cwd = process.cwd();
  const cacheManager = new DiscoveryCacheManager(cwd);

  // Handle --interactive mode: use cached discoveries
  if (options.interactive) {
    let cache = options.force ? null : cacheManager.loadIfFresh();

    // auto-refresh if cache is stale/missing or --force is used
    if (!cache) {
      const spinner = ora("Refreshing document discovery cache...").start();

      try {
        // run discovery inline
        const discovery = new DocumentDiscovery(cwd);
        const standardDocs = [
          'CONTRIBUTING',
          'CODE_OF_CONDUCT',
          'ARCHITECTURE',
          'API',
          'TESTING',
          'DEPLOYMENT',
          'SECURITY'
        ];

        const foundDocs: Record<string, string[]> = {};
        for (const docName of standardDocs) {
          const matches = discovery.findExactMatches(docName);
          if (matches.length > 0) {
            foundDocs[docName] = matches;
          }
        }

        // generate and save suggestions
        const suggestions = cacheManager.generateSuggestions(foundDocs);
        cacheManager.save(foundDocs, [], suggestions);

        // reload fresh cache
        cache = cacheManager.load();
        spinner.succeed(
          options.force
            ? "Cache refreshed"
            : "Cache was stale, refreshed automatically"
        );
      } catch (error) {
        spinner.fail("Failed to refresh cache");
        throw error;
      }
    }

    if (!cache || cache.suggestions.length === 0) {
      console.log(chalk.yellow("\n⚠️  No discovered documentation found."));
      console.log(
        chalk.dim("Run this command after init to use discovered docs.\n")
      );
      return;
    }

    console.log(
      chalk.blue.bold("\n📚 Creating Skills from Discovered Documentation\n")
    );
    console.log(
      chalk.dim(
        `Discovered ${cache.suggestions.length} document${
          cache.suggestions.length > 1 ? "s" : ""
        } on ${new Date(cache.discoveredAt).toLocaleDateString()}\n`
      )
    );

    // Let user select which docs to create skills from
    const { selected } = (await prompts({
      type: "multiselect",
      name: "selected",
      message: "Select documents to create skills from:",
      choices: cache.suggestions.map((sug) => ({
        title: `${sug.docPath} → ${sug.suggestedSkillName} ${chalk.dim(
          `(${sug.confidence}%)`
        )}`,
        value: sug,
        selected: sug.confidence > 80,
      })),
      hint: "Space to select, Enter to confirm",
    })) as { selected: DocumentSuggestion[] | undefined };

    if (!selected || selected.length === 0) {
      console.log(chalk.yellow("\nNo documents selected.\n"));
      return;
    }

    // Create skill for each selected document
    for (const suggestion of selected) {
      console.log(
        chalk.dim(`\nCreating skill: ${suggestion.suggestedSkillName}...`)
      );

      // use all matching files if available, otherwise just the primary doc
      const docPaths = suggestion.allFiles ?? [suggestion.docPath];
      const description =
        docPaths.length > 1
          ? `Guidelines and patterns from ${docPaths.length} documents`
          : `Guidelines and patterns from ${path.basename(suggestion.docPath)}`;

      generateSkill(
        suggestion.suggestedSkillName,
        docPaths,
        description,
        suggestion.suggestedKeywords,
        cwd
      );

      // add minimal activation rule for this skill
      const skillRule = {
        type: "domain" as const,
        enforcement: "suggest" as const,
        priority: "medium" as const,
        description,
        promptTriggers: {
          keywords: suggestion.suggestedKeywords.slice(0, 8), // limit to top keywords
        },
      };

      addToSkillRules(suggestion.suggestedSkillName, skillRule, cwd);

      console.log(
        chalk.green(
          `✓ Created ${suggestion.suggestedSkillName}${
            docPaths.length > 1 ? ` (${docPaths.length} resources)` : ""
          }`
        )
      );
    }

    console.log(
      chalk.green.bold(
        `\n✨ Created ${selected.length} skill${
          selected.length > 1 ? "s" : ""
        }!\n`
      )
    );
    console.log(chalk.dim("Next steps:"));
    console.log(chalk.dim(`  1. Review: .claude/skills/<skill-name>/SKILL.md`));
    console.log(
      chalk.dim(`  2. Customize trigger patterns in skill-rules.yaml`)
    );
    console.log(
      chalk.dim(
        `  3. Test by asking Claude about ${
          selected[0]?.suggestedKeywords[0] ?? "your project"
        }\n`
      )
    );
    return;
  }

  // Handle --template mode: browse and install templates
  if (options.template) {
    const catalog = new TemplateCatalog();
    const templates = catalog.loadAll();

    if (templates.length === 0) {
      console.log(chalk.yellow("\n⚠️  No templates available."));
      console.log(chalk.dim("Templates will be added in future releases.\n"));
      return;
    }

    console.log(chalk.blue.bold("\n📦 Template Catalog\n"));
    console.log(
      chalk.dim(
        `${templates.length} template${
          templates.length > 1 ? "s" : ""
        } available\n`
      )
    );

    // group by category
    const grouped = catalog.groupByCategory();
    const choices: TemplateChoice[] = [];

    for (const [category, categoryTemplates] of grouped) {
      choices.push({
        title: chalk.bold(`\n${category.toUpperCase()}`),
        value: null,
        disabled: true,
      });

      for (const template of categoryTemplates) {
        choices.push({
          title: `  ${template.manifest.displayName} - ${chalk.dim(
            template.manifest.description
          )}`,
          value: template,
        });
      }
    }

    const { selected } = (await prompts({
      type: "multiselect",
      name: "selected",
      message: "Select templates to install:",
      choices,
      hint: "Space to select, Enter to confirm",
    })) as { selected: TemplateInfo[] | undefined };

    if (!selected || selected.length === 0) {
      console.log(chalk.yellow("\nNo templates selected.\n"));
      return;
    }

    // install selected templates
    const spinner = ora("Installing templates...").start();

    // parse user-provided variables
    const userVariables = parseVariables(options.var);

    for (const template of selected) {
      // merge: user variables override defaults, PROJECT_NAME as fallback
      const variables = {
        PROJECT_NAME: path.basename(cwd),
        ...userVariables
      };

      catalog.install(template, cwd, variables);

      // add to skill-rules.yaml
      addToSkillRules(
        template.manifest.name,
        template.manifest.skillRule,
        cwd
      );

      spinner.text = `Installed ${template.manifest.displayName}`;
    }

    spinner.succeed(
      chalk.green(
        `Installed ${selected.length} template${
          selected.length > 1 ? "s" : ""
        }!\n`
      )
    );

    console.log(chalk.dim("Installed skills:"));
    for (const t of selected) {
      // t is a template object with manifest property
      const template = t as { manifest: { displayName: string } };
      console.log(chalk.dim(`  ✓ ${template.manifest.displayName}`));
    }

    console.log("");
    console.log(chalk.dim("Next steps:"));
    console.log(chalk.dim(`  1. Review: .claude/skills/<skill-name>/SKILL.md`));
    console.log(
      chalk.dim(`  2. Customize trigger patterns in skill-rules.yaml\n`)
    );
    return;
  }

  console.log(chalk.blue.bold(`\n🎯 Adding skill: ${skillName}\n`));

  const discovery = new DocumentDiscovery(cwd);

  // 1. Check if skill already exists in .claude/skills/
  const existing = discovery.checkExistingSkill(skillName);

  if (existing.exists) {
    const { action } = (await prompts({
      type: "select",
      name: "action",
      message: `Skill '${skillName}' already exists. What would you like to do?`,
      choices: [
        { title: "Keep existing (no changes)", value: "keep" },
        { title: "Update resources only", value: "merge" },
        { title: "Replace entirely", value: "replace" },
        { title: "Skip this skill", value: "skip" },
      ],
    })) as { action: "keep" | "merge" | "replace" | "skip" | undefined };

    if (action === "skip") return;
    if (action === "keep") {
      console.log(chalk.dim("Keeping existing skill unchanged."));
      return;
    }

    if (action === "replace") {
      const { confirm } = (await prompts({
        type: "confirm",
        name: "confirm",
        message: chalk.yellow(
          "This will overwrite the existing SKILL.md. Continue?"
        ),
        initial: false,
      })) as { confirm: boolean | undefined };

      if (!confirm) {
        console.log(chalk.yellow("Aborted."));
        return;
      }
    }
  }

  // 2. Interactive prompts for description and keywords (Option C!)
  const { description, keywordsInput } = (await prompts([
    {
      type: "text",
      name: "description",
      message: "Brief description of this skill:",
      initial: options.description ?? "",
      validate: (value: string) =>
        value.length > 0 ? true : "Description required",
    },
    {
      type: "text",
      name: "keywordsInput",
      message: "Keywords to search docs with (comma-separated):",
      initial: options.keywords ?? guessKeywords(skillName),
      validate: (value: string) =>
        value.length > 0 ? true : "At least one keyword required",
    },
  ])) as { description: string | undefined; keywordsInput: string | undefined };

  if (!description || !keywordsInput) {
    console.log(chalk.yellow("\nAborted."));
    return;
  }

  const keywords = keywordsInput
    .split(",")
    .map((k: string) => k.trim())
    .filter(Boolean);

  // 3. Search for related documentation
  const spinner = ora("Searching for related documentation...").start();

  const exactMatches = discovery.findExactMatches(skillName);
  const keywordMatches = discovery.findKeywordMatches(keywords, description);

  spinner.stop();

  // 4. Present findings to user
  const selectedDocs = await promptDocumentSelection(
    exactMatches,
    keywordMatches,
    existing.resources ?? []
  );

  if (selectedDocs === null) {
    console.log(chalk.yellow("Aborted."));
    return;
  }

  // 5. Generate or update skill
  spinner.start("Generating skill...");

  generateSkill(skillName, selectedDocs, description, keywords, cwd);

  spinner.succeed(chalk.green(`Skill '${skillName}' ready!`));

  console.log(chalk.dim("\nNext steps:"));
  console.log(chalk.dim(`  1. Review: .claude/skills/${skillName}/SKILL.md`));
  console.log(
    chalk.dim(
      `  2. Add to skill-rules.yaml (trigger patterns and validation rules)`
    )
  );
  console.log(
    chalk.dim(
      `  3. Test: Ask Claude about ${keywords.slice(0, 2).join(" or ")}\n`
    )
  );
}

/**
 * Guess initial keywords from skill name
 */
function guessKeywords(skillName: string): string {
  const words = skillName.split("-");

  const synonyms: Record<string, string[]> = {
    test: ["testing", "spec", "TDD"],
    frontend: ["UI", "component", "client"],
    backend: ["API", "server", "service"],
    dev: ["development", "coding"],
    planning: ["plan", "strategy", "roadmap"],
    adaptive: ["flexible", "dynamic", "iterative"],
    driven: ["methodology", "approach"],
    security: ["auth", "authorization", "authentication"],
    performance: ["optimization", "speed", "efficiency"],
  };

  const expanded = words.flatMap((word) => {
    const lower = word.toLowerCase();
    return synonyms[lower] ? [word, ...synonyms[lower]] : [word];
  });

  return expanded.join(", ");
}

/**
 * Prompt user to select documents
 */
async function promptDocumentSelection(
  exactMatches: string[],
  keywordMatches: KeywordMatch[],
  existingResources: ExistingResource[]
): Promise<string[] | null> {
  if (exactMatches.length === 0 && keywordMatches.length === 0) {
    console.log(chalk.dim("\nNo related documentation found in docs/"));

    const { proceed } = (await prompts({
      type: "confirm",
      name: "proceed",
      message: "Create skill with generated template only?",
      initial: true,
    })) as { proceed: boolean | undefined };

    return proceed ? [] : null;
  }

  console.log(chalk.dim("\n📄 Documentation found:\n"));

  const choices = [
    ...exactMatches.map((doc) => ({
      title: `${doc} ${chalk.green("(exact match)")}`,
      value: doc,
      selected: true,
    })),
    ...keywordMatches
      .filter((m) => m.confidence > 30)
      .map((match) => ({
        title: `${match.path} ${chalk.dim(
          `(${match.confidence.toFixed(0)}% - ${match.matchedKeywords
            .slice(0, 3)
            .join(", ")})`
        )}`,
        value: match.path,
        selected: match.confidence > 70,
      })),
  ];

  if (existingResources.length > 0) {
    console.log(chalk.dim("📚 Existing resources:"));
    existingResources.forEach((r) => {
      console.log(chalk.dim(`   ${r.isSymlink ? "→" : "-"} ${r.name}`));
    });
    console.log("");
  }

  const { selected } = (await prompts({
    type: "multiselect",
    name: "selected",
    message: "Select documentation to include as resources:",
    choices,
    hint: "Space to select, Enter to confirm",
    instructions: false,
  })) as { selected: string[] | undefined };

  return selected ?? [];
}

/**
 * Generate skill with symlinks to existing docs
 */
function generateSkill(
  skillName: string,
  selectedDocs: string[],
  description: string,
  keywords: string[],
  projectDir: string
): void {
  const skillDir = path.join(projectDir, ".claude", "skills", skillName);
  const resourceDir = path.join(skillDir, "resources");

  const writer = new FileWriter(skillDir);

  // Format skill name for title
  const titleCase = skillName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  // Create SKILL.md
  const skillContent = `---
name: ${skillName}
description: ${description}
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
model: inherit
---

# ${titleCase}

## Purpose
${description}

## Keywords
${keywords.map((k) => `- ${k}`).join("\n")}

## Project Documentation

${
  selectedDocs.length > 0
    ? "Your project has existing documentation:"
    : "No existing documentation found."
}

${selectedDocs
  .map((doc) => `- [${path.basename(doc)}](resources/${path.basename(doc)})`)
  .join("\n")}

## Guidelines

[Add skill-specific guidelines here based on your project patterns]

## Quick Reference

[Add quick reference examples and common patterns]
`;

  writer.write("SKILL.md", skillContent);

  // Create symlinks to existing docs
  if (selectedDocs.length > 0) {
    fs.mkdirSync(resourceDir, { recursive: true });

    for (const doc of selectedDocs) {
      const docFullPath = path.join(projectDir, doc);
      const linkPath = path.join(resourceDir, path.basename(doc));
      const relativePath = path.relative(resourceDir, docFullPath);

      // Create symlink
      if (fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
      }

      try {
        fs.symlinkSync(relativePath, linkPath);
      } catch (_error) {
        // fallback: copy file if symlink fails (e.g., on Windows)
        fs.copyFileSync(docFullPath, linkPath);
        console.log(
          chalk.dim(`   Note: Copied ${doc} (symlink not supported)`)
        );
      }
    }
  }
}

const SCHEMA_URL =
  "https://raw.githubusercontent.com/your-org/create-auto-loading-claude-skills/main/schema/skill-rules.schema.json";

/**
 * Write YAML config (YAML is the single source of truth)
 */
function writeSkillConfig(
  config: SkillConfig,
  yamlPath: string,
  jsonPath: string
): void {
  // yaml is the single source of truth
  const yamlContent =
    `# yaml-language-server: $schema=${SCHEMA_URL}\n` + yaml.dump(config);
  fs.writeFileSync(yamlPath, yamlContent, "utf8");

  // warn if deprecated JSON file exists
  if (fs.existsSync(jsonPath)) {
    console.log(
      chalk.yellow(
        "\n⚠️  Deprecation: skill-rules.json is deprecated.\n" +
          "   YAML is now the canonical format. Your JSON config will still be read,\n" +
          "   but new changes will only be written to skill-rules.yaml.\n" +
          "   Consider removing skill-rules.json after verifying skill-rules.yaml is correct.\n"
      )
    );
  }
}

/**
 * Add skill rule to skill-rules.yaml (YAML is the single source of truth)
 */
function addToSkillRules(
  skillName: string,
  skillRule: SkillRule,
  projectDir: string
): void {
  const yamlPath = path.join(
    projectDir,
    ".claude",
    "skills",
    "skill-rules.yaml"
  );
  const jsonPath = path.join(
    projectDir,
    ".claude",
    "skills",
    "skill-rules.json"
  );

  const yamlExists = fs.existsSync(yamlPath);
  const jsonExists = fs.existsSync(jsonPath);

  let config: SkillConfig;

  if (!yamlExists && !jsonExists) {
    // create new config using runtime factory for default values
    const defaults = createDefaultConfig();
    config = {
      ...defaults,
      description: "Auto-activation rules for Claude Code skills",
      skills: {
        [skillName]: skillRule,
      },
    } as SkillConfig;
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

  writeSkillConfig(config, yamlPath, jsonPath);
}
