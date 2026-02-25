#!/usr/bin/env node
import { program } from "commander";
import { readFile } from "fs/promises";
import { join } from "path";

import { getPackageRoot } from "../core/paths.js";

import type { AssembleOptions, DetectOptions, InitOptions, LintOptions } from "../types/index.js";

const packageJsonContent = await readFile(
  join(getPackageRoot(), "package.json"),
  "utf8",
);
const packageJson = JSON.parse(packageJsonContent) as { version: string };

program
  .name("doc-lint")
  .description("Documentation linter - assembles evaluation prompts from concern schemas")
  .version(packageJson.version);

program
  .command("assemble [path]")
  .description("Assemble evaluation prompts (no LLM call)")
  .requiredOption("--tier <level>", "Tier scope: 1 (foundational), 2 (+ behavioral), 3 (+ structural), all (+ interactions)")
  .option("-c, --config <file>", "Path to doc-lint.yaml")
  .option("-f, --format <format>", "Output format (human|json)")
  .option("--no-contradiction", "Skip contradiction scanner")
  .option("--concerns <ids>", "Only specific concerns (comma-separated)")
  .option("--auto-detect", "Auto-detect signals from document content")
  .option("--no-auto-detect", "Disable auto-detection (overrides manifest)")
  .option("--warn-on-mismatch", "Warn when detected signals differ from declared")
  .option("--no-warn-on-mismatch", "Disable mismatch warnings")
  .option("-o, --output-dir <path>", "Write each prompt as a standalone .md file to this directory")
  .option("--no-inline", "Reference documents by file path instead of inlining content")
  .action(async (projectPath: string | undefined, options: AssembleOptions) => {
    const { assembleCommand } = await import("../commands/assemble.js");
    const exitCode = await assembleCommand(projectPath, options);
    process.exit(exitCode);
  });

program
  .command("lint [path]")
  .description("Assemble + evaluate (requires engine)")
  .requiredOption("--tier <level>", "Tier scope: 1 (foundational), 2 (+ behavioral), 3 (+ structural), all (+ interactions)")
  .option("--engine <engine>", "Evaluation engine (default: sdk)", "sdk")
  .option("-c, --config <file>", "Path to doc-lint.yaml")
  .option("-f, --format <format>", "Output format (human|json)", "human")
  .option("--no-contradiction", "Skip contradiction scanner")
  .option("--concerns <ids>", "Only specific concerns (comma-separated)")
  .option("--dry-run", "Show matched concerns, don't evaluate")
  .option("--verbose", "Detailed progress")
  .option("--severity-threshold <level>", "Minimum severity to display (error|warn|note)")
  .option("--allow-implicit", "Accept implicit documentation as coverage")
  .option("--allow-external-refs", "Accept external references as partial coverage")
  .option("--auto-detect", "Auto-detect signals from document content")
  .option("--no-auto-detect", "Disable auto-detection (overrides manifest)")
  .option("--warn-on-mismatch", "Warn when detected signals differ from declared")
  .option("--no-warn-on-mismatch", "Disable mismatch warnings")
  .action(async (projectPath: string | undefined, options: LintOptions) => {
    const { lintCommand } = await import("../commands/lint.js");
    const exitCode = await lintCommand(projectPath, options);
    process.exit(exitCode);
  });

program
  .command("detect [path]")
  .description("Generate a signal detection prompt for LLM handoff")
  .option("-c, --config <file>", "Path to doc-lint.yaml")
  .option("-f, --format <format>", "Output format (human|json)")
  .option("-o, --output-dir <path>", "Write signal-detection.md to this directory")
  .option("--no-inline", "Reference documents by file path instead of inlining content")
  .action(async (projectPath: string | undefined, options: DetectOptions) => {
    const { detectCommand } = await import("../commands/detect.js");
    const exitCode = await detectCommand(projectPath, options);
    process.exit(exitCode);
  });

program
  .command("init [path]")
  .description("Initialize doc-lint.yaml by discovering documents and detecting signals")
  .option("-y, --yes", "Non-interactive mode (skip prompts)")
  .option("--ignore <glob>", "Glob pattern to ignore during discovery (repeatable)", (val: string, prev: string[]) => [...prev, val], [] as string[])
  .action(async (projectPath: string | undefined, options: InitOptions) => {
    const { initCommand } = await import("../commands/init.js");
    const exitCode = await initCommand(projectPath, options);
    process.exit(exitCode);
  });

program
  .command("list")
  .description("List all bundled concerns with trigger signals")
  .action(async () => {
    const { listCommand } = await import("../commands/list.js");
    await listCommand();
    process.exit(0);
  });

program.parse();
