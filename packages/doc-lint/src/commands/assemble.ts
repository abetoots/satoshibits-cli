import * as path from "node:path";

import { assemble } from "../core/evaluator.js";
import { loadManifest } from "../core/manifest.js";
import { formatAssembleJson } from "../formatters/json.js";
import { formatAssembleHuman } from "../formatters/human.js";
import { writePromptFiles } from "../formatters/files.js";

import type { AssembleOptions } from "../types/index.js";
import { parseTierFlag } from "../core/tier.js";

export async function assembleCommand(
  projectPath: string | undefined,
  options: AssembleOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");

  // code-first has no authored docs to assemble — redirect to bootstrap.
  try {
    if (loadManifest(resolved, options.config).mode === "code-first") {
      console.error(
        "This is a code-first project (no authored docs). Run `doc-lint bootstrap` to " +
          "scaffold as-built docs + a documentation gap inventory.",
      );
      return 2;
    }
  } catch {
    // no manifest yet; let assemble surface the error
  }

  const tierFilter = parseTierFlag(options.tier);
  if (tierFilter === null) {
    console.error(
      `Error: invalid --tier value "${options.tier}". Use 1, 2, 3, or all`,
    );
    return 2;
  }

  const filterConcernIds = options.concerns
    ? options.concerns.split(",").map((s) => s.trim())
    : undefined;

  if (!options.format && !options.outputDir) {
    console.error(
      "Error: specify an output mode — either -f (human|json) or -o <dir>\n\n" +
      "Examples:\n" +
      "  doc-lint assemble . --tier 1 -f json            # JSON to stdout\n" +
      "  doc-lint assemble . --tier all -f human          # human-readable summary to stdout\n" +
      "  doc-lint assemble . --tier 1 -o ./prompts        # one .md file per prompt, ready for LLM handoff",
    );
    return 2;
  }

  const result = await assemble({
    projectPath: resolved,
    configPath: options.config,
    contradiction: options.contradiction,
    filterConcernIds,
    tierFilter,
    tierCumulative: options.tierCumulative,
    autoDetect: options.autoDetect,
    warnOnMismatch: options.warnOnMismatch,
    inline: options.inline,
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
