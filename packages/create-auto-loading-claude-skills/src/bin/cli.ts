#!/usr/bin/env node
import { program } from "commander";
import { readFile } from "fs/promises";
import { join } from "path";

import type {
  AddSkillOptions,
  InitOptions,
  SyncOptions,
  UpgradeOptions,
  ValidateOptions,
} from "../types/index.js";

// get package.json for version
// path is ../../../ because compiled output is at dist/src/bin/cli.js
const packageJsonContent = await readFile(
  join(import.meta.dirname, "../../../package.json"),
  "utf8",
);
const packageJson = JSON.parse(packageJsonContent) as { version: string };

program
  .name("@satoshibits/create-auto-loading-claude-skills")
  .description("Scaffolding CLI for Claude Code auto-loading skill system")
  .version(packageJson.version);

program
  .command("init")
  .description("Initialize skill system in current project")
  .option(
    "-t, --type <type>",
    "Project type (backend/frontend/fullstack/custom)",
  )
  .option("-y, --yes", "Skip prompts, use defaults")
  .action(async (options: InitOptions) => {
    const { initCommand } = await import("../commands/init.js");
    await initCommand(options);
  });

// helper to collect multiple --var options
function collectVar(value: string, previous: string[]) {
  return previous.concat([value]);
}

program
  .command("add-skill [skill-name]")
  .description("Add a skill to existing setup")
  .option("-d, --description <desc>", "Skill description")
  .option(
    "-k, --keywords <keywords>",
    "Comma-separated keywords for doc search",
  )
  .option("-i, --interactive", "Create skills from discovered documentation")
  .option("-f, --force", "Force cache refresh (ignore TTL)")
  .option("-t, --template", "Browse and install from template catalog")
  .option(
    "-v, --var <key=value>",
    "Template variable (can be used multiple times)",
    collectVar,
    [],
  )
  .option(
    "-w, --wizard",
    "Interactive classification wizard for trigger configuration",
  )
  .action(
    async (
      skillName: string | undefined,
      options: AddSkillOptions & { wizard?: boolean },
    ) => {
      // wizard mode: run classification wizard
      if (options.wizard) {
        if (!skillName) {
          console.error(
            "Error: skill-name is required when using --wizard flag",
          );
          process.exit(1);
        }
        const { addSkillWizardCommand } =
          await import("../commands/add-skill-wizard.js");
        await addSkillWizardCommand(skillName);
        return;
      }

      const { addSkillCommand } = await import("../commands/add-skill.js");

      // skill-name is required unless --interactive or --template flag is used
      if (!skillName && !options.interactive && !options.template) {
        console.error(
          "Error: skill-name is required (or use --interactive/--template flag)",
        );
        process.exit(1);
      }

      await addSkillCommand(skillName ?? "", options);
    },
  );

program
  .command("validate")
  .description("Validate skill-rules configuration")
  .option("-f, --fix", "Auto-fix issues where possible")
  .action(async (options: ValidateOptions) => {
    const { validateCommand } = await import("../commands/validate.js");
    await validateCommand(options);
  });

program
  .command("upgrade")
  .description("Upgrade hooks to latest version")
  .option("--backup", "Create backup before upgrading", true)
  .action(async (options: UpgradeOptions) => {
    const { upgradeCommand } = await import("../commands/upgrade.js");
    await upgradeCommand(options);
  });

program
  .command("sync")
  .description("Sync x-smart-triggers from SKILL.md files to skill-rules.yaml")
  .option("--dry-run", "Show what would be synced without writing")
  .option("-v, --verbose", "Show detailed sync information")
  .option("--force", "Overwrite manual entries (default: preserve)")
  .action(async (options: SyncOptions) => {
    const { syncCommand } = await import("../commands/sync.js");
    await syncCommand(options);
  });

program
  .command("sync-status")
  .description("Check if skill-rules.yaml is in sync with SKILL.md files")
  .action(async () => {
    const { checkSyncStatus } = await import("../commands/sync.js");
    const chalk = (await import("chalk")).default;
    const status = await checkSyncStatus();
    if (status.isStale) {
      console.log(chalk.yellow(`⚠️  ${status.message}`));
      process.exit(1);
    } else {
      console.log(chalk.green(`✓ ${status.message}`));
    }
  });

program.parse();
