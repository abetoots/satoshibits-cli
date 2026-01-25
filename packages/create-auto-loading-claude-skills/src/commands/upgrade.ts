import chalk from "chalk";
import ora from "ora";
// eslint-disable-next-line import-x/no-named-as-default -- prompts library exports default function named 'prompts'
import prompts from "prompts";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import type { UpgradeOptions } from "../types/index.js";
import { PackageJson } from "../utils/project-detector.js";

/**
 * Hook configuration from settings.json
 */
interface HookConfig {
  hooks?: {
    command?: string;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

export async function upgradeCommand(options: UpgradeOptions) {
  console.log(chalk.blue.bold("\n⬆️  Upgrading Auto-Loading Skill System\n"));

  const cwd = process.cwd();
  const claudeDir = path.join(cwd, ".claude");
  const hooksDir = path.join(claudeDir, "hooks");

  // 1. Check if .claude/ exists
  if (!fs.existsSync(claudeDir)) {
    console.log(chalk.red("❌ Error: .claude/ directory not found"));
    console.log(
      chalk.dim("   Run: npx create-auto-loading-claude-skills init\n"),
    );
    process.exit(1);
  }

  // 2. Check if hooks/ exists (upgrade requires existing hooks)
  if (!fs.existsSync(hooksDir)) {
    console.log(chalk.red("❌ Error: .claude/hooks/ directory not found"));
    console.log(
      chalk.dim(
        "   Nothing to upgrade. Run: npx create-auto-loading-claude-skills init\n",
      ),
    );
    process.exit(1);
  }

  // 2. Confirm upgrade
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: "This will update hook files to the latest version. Continue?",
    initial: true,
  });

  if (!confirm) {
    console.log(chalk.yellow("Upgrade cancelled.\n"));
    return;
  }

  const spinner = ora("Preparing upgrade...").start();

  try {
    // 3. Create backup if requested
    if (options.backup !== false) {
      // include time to prevent overwrites when upgrading multiple times per day
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19); // "2024-01-15_12-30-45"
      const backupDir = path.join(claudeDir, `hooks-backup-${timestamp}`);

      spinner.text = "Creating backup...";
      fs.cpSync(hooksDir, backupDir, { recursive: true });
      spinner.info(chalk.dim(`Backup created: ${backupDir}`));
      spinner.start();
    }

    // 4. Update hook templates (copy entire directory)
    spinner.text = "Updating hook files...";

    const templateDir = path.join(import.meta.dirname, "../templates/hooks");

    // copy hook files recursively, excluding _internal directory (now in claude-skill-runtime)
    fs.cpSync(templateDir, hooksDir, {
      recursive: true,
      filter: (src) => !src.includes("_internal"),
    });

    // remove old _internal directory if it exists (migrating to claude-skill-runtime)
    const internalDir = path.join(hooksDir, "_internal");
    if (fs.existsSync(internalDir)) {
      fs.rmSync(internalDir, { recursive: true, force: true });
    }

    spinner.text = "Checking dependencies...";

    // 5. Update package.json if needed
    const packageJsonPath = path.join(hooksDir, "package.json");

    if (fs.existsSync(packageJsonPath)) {
      const currentPkg = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8"),
      ) as PackageJson;

      const expectedDeps = {
        "claude-skill-runtime": "^0.0.0",
      };

      // remove old dependencies that are now bundled in claude-skill-runtime
      const depsToRemove = ["js-yaml", "minimatch", "proper-lockfile"];
      for (const dep of depsToRemove) {
        if (currentPkg.dependencies?.[dep]) {
          delete currentPkg.dependencies[dep];
        }
      }

      let needsUpdate = false;

      for (const [dep, version] of Object.entries(expectedDeps)) {
        if (currentPkg.dependencies?.[dep] !== version) {
          needsUpdate = true;
          currentPkg.dependencies ??= {};
          currentPkg.dependencies[dep] = version;
        }
      }

      if (needsUpdate) {
        fs.writeFileSync(packageJsonPath, JSON.stringify(currentPkg, null, 2));
        spinner.text = "Installing dependencies...";

        try {
          // use --ignore-workspace to handle monorepo environments
          execSync("pnpm install --silent --ignore-workspace", {
            cwd: hooksDir,
            stdio: "ignore",
          });
        } catch {
          // fallback to npm
          try {
            execSync("npm install --silent", {
              cwd: hooksDir,
              stdio: "ignore",
            });
          } catch {
            spinner.warn("Could not install dependencies automatically");
            console.log(
              chalk.yellow(
                "\n⚠️  Please run: cd .claude/hooks && npm install\n",
              ),
            );
          }
        }
      }
    }

    // 6. Check settings.json
    spinner.text = "Verifying settings.json...";

    const settingsPath = path.join(claudeDir, "settings.json");

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(
        fs.readFileSync(settingsPath, "utf8"),
      ) as Record<string, unknown>;

      // verify hooks are properly registered
      const expectedHooks = {
        UserPromptSubmit: "skill-activation-prompt.js",
        PostToolUse: "post-tool-use-tracker.js",
        Stop: "stop-validator.js",
      };

      const warnings: string[] = [];

      for (const [hookType, scriptName] of Object.entries(expectedHooks)) {
        const hookConfig = (settings.hooks as Record<string, unknown>)?.[
          hookType
        ];

        if (!hookConfig) {
          warnings.push(`${hookType} hook not registered`);
        } else {
          // check if the command references the correct script
          const hookArray = Array.isArray(hookConfig)
            ? hookConfig
            : [hookConfig];
          const hasCorrectScript = hookArray.some((h: HookConfig) =>
            h.hooks?.some((hook) => hook.command?.includes(scriptName)),
          );

          if (!hasCorrectScript) {
            warnings.push(`${hookType} hook may not reference ${scriptName}`);
          }
        }
      }

      if (warnings.length > 0) {
        spinner.warn("settings.json verification warnings:");
        warnings.forEach((w) => console.log(chalk.yellow(`   ⚠️  ${w}`)));
        console.log(
          chalk.dim(
            "\n   You may need to manually update .claude/settings.json\n",
          ),
        );
        spinner.start();
      }
    }

    spinner.succeed(chalk.green("Upgrade completed successfully!\n"));

    // 7. Summary
    console.log(chalk.bold("📋 Summary:\n"));
    console.log(chalk.green("  ✓ Hook files updated"));
    console.log(chalk.green("  ✓ Library files updated"));
    console.log(chalk.green("  ✓ Dependencies verified"));
    console.log("");

    console.log(chalk.bold("🚀 Next Steps:\n"));
    console.log(`  1. Test hooks: Ask Claude a question to verify activation`);
    console.log(`  2. Review backup: ${chalk.dim(".claude/hooks-backup-*/")}`);
    console.log(
      `  3. Validate config: ${chalk.cyan(
        "npx create-auto-loading-claude-skills validate",
      )}\n`,
    );
  } catch (error) {
    spinner.fail(chalk.red("Upgrade failed"));
    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
    }
    throw error;
  }
}
