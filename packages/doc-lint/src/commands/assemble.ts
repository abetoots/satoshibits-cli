import * as path from "node:path";

import { assemble } from "../core/evaluator.js";
import { formatAssembleJson } from "../formatters/json.js";
import { formatAssembleHuman } from "../formatters/human.js";
import { writePromptFiles } from "../formatters/files.js";

import type { AssembleOptions } from "../types/index.js";

export async function assembleCommand(
  projectPath: string | undefined,
  options: AssembleOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");

  const filterConcernIds = options.concerns
    ? options.concerns.split(",").map((s) => s.trim())
    : undefined;

  if (!options.format && !options.outputDir) {
    console.error(
      "Error: specify an output mode — either -f (human|json) or -o <dir>\n\n" +
      "Examples:\n" +
      "  doc-lint assemble . -f json            # JSON to stdout\n" +
      "  doc-lint assemble . -f human           # human-readable summary to stdout\n" +
      "  doc-lint assemble . -o ./prompts       # one .md file per prompt, ready for LLM handoff",
    );
    return 2;
  }

  const result = assemble({
    projectPath: resolved,
    configPath: options.config,
    contradiction: options.contradiction,
    filterConcernIds,
    autoDetect: options.autoDetect,
    warnOnMismatch: options.warnOnMismatch,
  });

  if (options.outputDir) {
    const outputPath = path.resolve(options.outputDir);
    const written = writePromptFiles(result, outputPath);
    console.error(`Wrote ${written.length} prompt files to ${outputPath}`);
    for (const file of written) {
      console.error(`  ${file}`);
    }
    return 0;
  }

  if (options.format === "json") {
    console.log(formatAssembleJson(result));
  } else {
    console.log(await formatAssembleHuman(result));
  }

  return 0;
}
