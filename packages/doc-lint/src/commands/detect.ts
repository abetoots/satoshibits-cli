import * as path from "node:path";

import { loadManifest } from "../core/manifest.js";
import { loadDocuments } from "../core/documents.js";
import { buildDetectPrompt } from "../core/detect-prompt-builder.js";
import { writeDetectFile } from "../formatters/files.js";

import type { DetectOptions } from "../types/index.js";
import type { DetectResult } from "../core/detect-prompt-builder.js";

function formatDetectJson(result: DetectResult): string {
  return JSON.stringify(result, null, 2);
}

async function formatDetectHuman(result: DetectResult): Promise<string> {
  const chalk = (await import("chalk")).default;
  const lines: string[] = [];

  lines.push(chalk.bold(`doc-lint detect: ${result.project}`));
  lines.push(chalk.dim(`Documents: ${result.documents.join(", ")}`));
  lines.push("");
  lines.push(chalk.bold("System Message"));
  lines.push(chalk.dim("─".repeat(60)));
  lines.push(result.prompt.system);
  lines.push("");
  lines.push(chalk.bold("Prompt"));
  lines.push(chalk.dim("─".repeat(60)));
  lines.push(result.prompt.user);

  return lines.join("\n");
}

export async function detectCommand(
  projectPath: string | undefined,
  options: DetectOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");

  if (!options.format && !options.outputDir) {
    console.error(
      "Error: specify an output mode — either -f (human|json) or -o <dir>\n\n" +
      "Examples:\n" +
      "  doc-lint detect . -f json             # JSON to stdout\n" +
      "  doc-lint detect . -f human            # human-readable prompt to stdout\n" +
      "  doc-lint detect . -o ./prompts        # signal-detection.md file for LLM handoff",
    );
    return 2;
  }

  const manifest = loadManifest(resolved, options.config);
  const docs = loadDocuments(manifest, resolved);
  const result = buildDetectPrompt(manifest.project.name, docs.all);

  if (options.outputDir) {
    const outputPath = path.resolve(options.outputDir);
    const written = writeDetectFile(result, outputPath);
    console.error(`Wrote ${written} to ${outputPath}`);
    return 0;
  }

  if (options.format === "json") {
    console.log(formatDetectJson(result));
  } else {
    console.log(await formatDetectHuman(result));
  }

  return 0;
}
