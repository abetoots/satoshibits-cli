import * as path from "node:path";

import { assemble } from "../core/evaluator.js";
import { formatAssembleJson } from "../formatters/json.js";
import { formatAssembleHuman } from "../formatters/human.js";

import type { AssembleOptions } from "../types/index.js";

export async function assembleCommand(
  projectPath: string | undefined,
  options: AssembleOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");

  const filterConcernIds = options.concerns
    ? options.concerns.split(",").map((s) => s.trim())
    : undefined;

  const result = assemble({
    projectPath: resolved,
    configPath: options.config,
    contradiction: options.contradiction,
    filterConcernIds,
    autoDetect: options.autoDetect,
    warnOnMismatch: options.warnOnMismatch,
  });

  const format = options.format ?? "json";

  if (format === "json") {
    console.log(formatAssembleJson(result));
  } else {
    console.log(await formatAssembleHuman(result));
  }

  return 0;
}
