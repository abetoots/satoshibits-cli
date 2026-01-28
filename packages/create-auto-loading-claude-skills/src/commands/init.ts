import { createDefaultConfig } from "@satoshibits/claude-skill-runtime";
import chalk from "chalk";
import yaml from "js-yaml";
import ora from "ora";
// eslint-disable-next-line import-x/no-named-as-default -- prompts library exports default function named 'prompts'
import prompts from "prompts";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import type { InitOptions } from "../types/index.js";

import { DiscoveryCacheManager } from "../utils/discovery-cache.js";
import { DocumentDiscovery } from "../utils/document-discovery.js";
import { FileWriter } from "../utils/file-writer.js";
import { ProjectDetector } from "../utils/project-detector.js";

export async function initCommand(options: InitOptions) {
  console.log(chalk.blue.bold("\n🎯 Initializing Auto-Loading Skill System\n"));

  const cwd = process.cwd();
  const claudeDir = path.join(cwd, ".claude");
  const hooksDir = path.join(claudeDir, "hooks");
  const skillsDir = path.join(claudeDir, "skills");
  const settingsPath = path.join(claudeDir, "settings.json");

  // 1. Check for previous installation (not just .claude/ existence)
  let existingHooks = false;
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(
        fs.readFileSync(settingsPath, "utf8"),
      ) as Record<string, unknown>;
      existingHooks = !!settings.hooks;
    } catch {
      // invalid JSON, will be overwritten
    }
  }

  const previousInstall =
    fs.existsSync(hooksDir) ||
    fs.existsSync(path.join(skillsDir, "skill-rules.yaml")) ||
    fs.existsSync(path.join(skillsDir, "skill-rules.json")) ||
    existingHooks;

  if (previousInstall) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { action } = await prompts({
      type: "select",
      name: "action",
      message: "Previous installation detected. What would you like to do?",
      choices: [
        { title: "Upgrade existing setup", value: "upgrade" },
        { title: "Abort installation", value: "abort" },
        {
          title: "Reinstall (removes hooks/, skills/, cache/)",
          value: "reinstall",
        },
      ],
    });

    if (action === "abort") {
      console.log(chalk.yellow("Installation aborted."));
      return;
    }

    if (action === "reinstall") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: chalk.red(
          "⚠️  This will remove hooks/, skills/, and cache/ directories. Continue?",
        ),
        initial: false,
      });

      if (!confirm) {
        console.log(chalk.yellow("Installation aborted."));
        return;
      }

      // remove only our directories, not the entire .claude/
      if (fs.existsSync(hooksDir)) {
        fs.rmSync(hooksDir, { recursive: true, force: true });
      }
      if (fs.existsSync(skillsDir)) {
        fs.rmSync(skillsDir, { recursive: true, force: true });
      }
      const cacheDir = path.join(claudeDir, "cache");
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
      // remove hooks from settings.json if present
      if (fs.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(
            fs.readFileSync(settingsPath, "utf8"),
          ) as Record<string, unknown>;
          delete settings.hooks;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch {
          // if settings.json is invalid, it will be overwritten later
        }
      }
      console.log(chalk.dim("Removed previous installation\n"));
    } else if (action === "upgrade") {
      const { upgradeCommand } = await import("./upgrade.js");
      await upgradeCommand({ backup: true });
      return;
    }
  }

  // 2. Detect project type
  const detector = new ProjectDetector(cwd);
  const projectConfig = detector.detect();

  console.log(chalk.dim("📁 Project Detection:"));
  console.log(chalk.dim(`   Type: ${projectConfig.type}`));
  if (projectConfig.frameworks.length > 0) {
    console.log(
      chalk.dim(`   Frameworks: ${projectConfig.frameworks.join(", ")}`),
    );
  }
  console.log("");

  // 3. Interactive prompts (unless --yes)
  let projectType = options.type ?? projectConfig.type;
  let maxSuggestions = 3;
  let enableDebugLogging = false;

  if (!options.yes) {
    const answers = await prompts([
      {
        type: "select",
        name: "projectType",
        message: "Project type:",
        initial: ["backend", "frontend", "fullstack", "custom"].indexOf(
          projectType,
        ),
        choices: [
          {
            title: "Backend",
            value: "backend",
            description: "API, services, databases",
          },
          {
            title: "Frontend",
            value: "frontend",
            description: "UI, components, styling",
          },
          {
            title: "Fullstack",
            value: "fullstack",
            description: "Both backend and frontend",
          },
          {
            title: "Custom",
            value: "custom",
            description: "Manual configuration",
          },
        ],
      },
      {
        type: "number",
        name: "maxSuggestions",
        message: "Maximum skill suggestions per prompt:",
        initial: 3,
        min: 1,
        max: 10,
      },
      {
        type: "confirm",
        name: "enableDebugLogging",
        message: "Enable debug logging?",
        initial: false,
      },
    ]);

    if (!answers.projectType) {
      console.log(chalk.yellow("\nInstallation cancelled."));
      return;
    }

    projectType = answers.projectType as string;
    maxSuggestions = answers.maxSuggestions as number;
    enableDebugLogging = answers.enableDebugLogging as boolean;
  }

  const spinner = ora("Setting up directory structure...").start();

  try {
    // 4. Create directory structure
    const writer = new FileWriter(cwd);

    const dirs = [
      ".claude/hooks",
      ".claude/hooks/lib",
      ".claude/skills",
      ".claude/cache",
    ];

    dirs.forEach((dir) => {
      fs.mkdirSync(path.join(cwd, dir), { recursive: true });
    });

    spinner.text = "Copying hook templates...";

    // 5. Copy hook templates (entire directory, excluding _internal which is now in claude-skill-runtime)
    const templateDir = path.join(import.meta.dirname, "../templates/hooks");
    const destHooksDir = path.join(cwd, ".claude/hooks");

    // copy hook files recursively, excluding _internal directory
    fs.cpSync(templateDir, destHooksDir, {
      recursive: true,
      filter: (src) => !src.includes("_internal"),
    });

    spinner.text = "Creating settings.json...";

    // 6. Create or update settings.json with hook registration
    // Preserve existing settings, only add/update hooks
    let existingSettings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(
          fs.readFileSync(settingsPath, "utf8"),
        ) as Record<string, unknown>;
      } catch {
        // invalid JSON, start fresh
      }
    }

    const hooksConfig = {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command:
                "node $CLAUDE_PROJECT_DIR/.claude/hooks/skill-activation-prompt.js",
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command:
                "node $CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-use-tracker.js",
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command:
                "node $CLAUDE_PROJECT_DIR/.claude/hooks/stop-validator.js",
            },
          ],
        },
      ],
    };

    const settings = {
      ...existingSettings,
      hooks: hooksConfig,
    };

    writer.write(".claude/settings.json", JSON.stringify(settings, null, 2));

    spinner.text = "Creating hook dependencies...";

    // 7. Create package.json for hooks
    const hooksPackageJson = {
      name: "claude-hooks",
      version: "1.0.0",
      type: "module",
      private: true,
      dependencies: {
        "@satoshibits/claude-skill-runtime": "^0.0.0",
      },
    };

    writer.write(
      ".claude/hooks/package.json",
      JSON.stringify(hooksPackageJson, null, 2),
    );

    spinner.text = "Creating .gitignore...";

    // 8. Create .gitignore for cache
    writer.write(".claude/cache/.gitignore", "*\n!.gitignore\n");

    spinner.text = "Discovering existing documentation...";

    // 9. Discover existing docs and persist to cache
    const discovery = new DocumentDiscovery(cwd);
    const commonDocs = [
      "CONTRIBUTING",
      "CODE_OF_CONDUCT",
      "ARCHITECTURE",
      "API",
      "TESTING",
      "DEPLOYMENT",
    ];

    const foundDocs: Record<string, string[]> = {};
    for (const docName of commonDocs) {
      const matches = discovery.findExactMatches(docName);
      if (matches.length > 0) {
        foundDocs[docName] = matches;
      }
    }

    // persist discovery results to cache
    const cacheManager = new DiscoveryCacheManager(cwd);
    const suggestions = cacheManager.generateSuggestions(foundDocs);
    cacheManager.save(foundDocs, [], suggestions);

    spinner.text = "Generating skill-rules configuration...";

    // 10. Generate minimal skill-rules configuration
    const skillRules = generateSkillRules(maxSuggestions, enableDebugLogging);

    // YAML is the single source of truth
    const schemaUrl =
      "https://raw.githubusercontent.com/satoshibits-cli/packages/create-auto-loading-claude-skills/main/schema/skill-rules.schema.json";
    const yamlContent =
      `# yaml-language-server: $schema=${schemaUrl}\n` + yaml.dump(skillRules);
    writer.write(".claude/skills/skill-rules.yaml", yamlContent);

    spinner.text = "Installing hook dependencies...";

    // 11. Install dependencies in .claude/hooks/
    // use execFileSync to avoid shell injection with unusual paths
    const hooksPath = path.join(cwd, ".claude/hooks");
    try {
      // use --ignore-workspace to handle monorepo environments
      execFileSync("pnpm", ["install", "--silent", "--ignore-workspace"], {
        cwd: hooksPath,
        stdio: "ignore",
      });
    } catch {
      // fallback to npm if pnpm not available or fails
      try {
        execFileSync("npm", ["install", "--silent"], {
          cwd: hooksPath,
          stdio: "ignore",
        });
      } catch {
        spinner.warn("Could not install hook dependencies automatically");
        console.log(
          chalk.yellow("\n⚠️  Please run: cd .claude/hooks && npm install\n"),
        );
      }
    }

    spinner.succeed(chalk.green("Auto-loading skill system initialized!\n"));

    // 12. Summary
    console.log(chalk.bold("📋 Summary:\n"));
    console.log(chalk.dim("  Created:"));
    console.log(chalk.dim(`    - .claude/hooks/ (3 hooks)`));
    console.log(chalk.dim(`    - .claude/skills/skill-rules.yaml`));
    console.log(chalk.dim(`    - .claude/settings.json (hook registration)`));
    console.log("");

    const docCount = cacheManager.getDocumentCount();

    // check template availability
    const { TemplateCatalog } = await import("../utils/template-catalog.js");
    const catalog = new TemplateCatalog();
    const templateCount = catalog.count();

    console.log(chalk.bold("🚀 Next Steps:\n"));

    if (docCount > 0) {
      console.log(
        chalk.green(
          `  📚 We found ${docCount} project document${
            docCount > 1 ? "s" : ""
          }!`,
        ),
      );
      if (templateCount > 0) {
        console.log(
          chalk.green(
            `  📦 ${templateCount} template${
              templateCount > 1 ? "s" : ""
            } available\n`,
          ),
        );
      } else {
        console.log("");
      }

      console.log(
        `  1. ${chalk.cyan("npx cl-auto-skills add-skill --interactive")}`,
      );
      console.log(chalk.dim(`     Create skills from your discovered docs\n`));

      if (templateCount > 0) {
        console.log(
          `  2. ${chalk.cyan("npx cl-auto-skills add-skill --template")}`,
        );
        console.log(
          chalk.dim(`     Browse and install from template catalog\n`),
        );
      }

      console.log(
        `  ${templateCount > 0 ? "3" : "2"}. Review configuration: ${chalk.cyan(
          ".claude/skills/skill-rules.yaml",
        )}`,
      );
      console.log(
        `  ${
          templateCount > 0 ? "4" : "3"
        }. Test: Ask Claude about ${chalk.cyan(
          projectType === "backend"
            ? "creating an API endpoint"
            : "building a component",
        )}`,
      );
    } else {
      if (templateCount > 0) {
        console.log(
          chalk.green(
            `  📦 ${templateCount} template${
              templateCount > 1 ? "s" : ""
            } available\n`,
          ),
        );

        console.log(
          `  1. ${chalk.cyan("npx cl-auto-skills add-skill --template")}`,
        );
        console.log(
          chalk.dim(`     Browse and install from template catalog\n`),
        );

        console.log(
          `  2. ${chalk.cyan("npx cl-auto-skills add-skill <name>")}`,
        );
        console.log(chalk.dim(`     Create a custom skill\n`));
      } else {
        console.log(
          `  1. ${chalk.cyan("npx cl-auto-skills add-skill <name>")}`,
        );
        console.log(chalk.dim(`     Create a custom skill\n`));
      }

      console.log(
        `  ${templateCount > 0 ? "3" : "2"}. Review: ${chalk.cyan(
          ".claude/skills/skill-rules.yaml",
        )}`,
      );
      console.log(
        `  ${templateCount > 0 ? "4" : "3"}. Validate: ${chalk.cyan(
          "npx cl-auto-skills validate",
        )}`,
      );
    }

    console.log("");
  } catch (error) {
    spinner.fail(chalk.red("Installation failed"));
    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
    }
    throw error;
  }
}

/**
 * Generate minimal skill-rules configuration
 *
 * NOTE: This creates an empty skills config. Users should add skills via:
 * - `add-skill --template` to install pre-made templates
 * - `add-skill --interactive` to create skills from discovered docs
 * - `add-skill <name>` to create custom skills
 *
 * This follows the architecture principle: init = scaffolder, add-skill = curator
 */
function generateSkillRules(
  maxSuggestions: number,
  enableDebugLogging: boolean,
): ReturnType<typeof createDefaultConfig> {
  // use runtime factory for default values, override user-selected settings
  const defaults = createDefaultConfig();
  return {
    ...defaults,
    description: "Auto-activation rules for Claude Code skills",
    settings: {
      ...defaults.settings,
      maxSuggestions,
      enableDebugLogging,
    },
    // skills will be added via `add-skill` command
  };
}
