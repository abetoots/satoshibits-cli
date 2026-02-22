import * as path from "node:path";

import { assemble, lint } from "../core/evaluator.js";
import { formatAssembleHuman, formatLintHuman } from "../formatters/human.js";
import { formatAssembleJson, formatLintJson } from "../formatters/json.js";
import { SdkEngine } from "../core/engine/sdk-engine.js";

import type { LintOptions, ToleranceConfig, Severity } from "../types/index.js";
import { parseTierFlag } from "../core/tier.js";

export async function lintCommand(
  projectPath: string | undefined,
  options: LintOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");

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

  // dry-run mode: show matched concerns without evaluating
  if (options.dryRun) {
    const result = assemble({
      projectPath: resolved,
      configPath: options.config,
      contradiction: options.contradiction,
      filterConcernIds,
      tierFilter,
      autoDetect: options.autoDetect,
      warnOnMismatch: options.warnOnMismatch,
    });

    const dryRunFormat = options.format ?? "human";
    if (dryRunFormat === "json") {
      console.log(formatAssembleJson(result));
    } else {
      console.log(await formatAssembleHuman(result));
    }
    return 0;
  }

  // validate and create evaluation engine
  const engineName = options.engine ?? "sdk";
  if (engineName !== "sdk") {
    console.error(`Unknown engine: "${String(engineName)}". Supported engines: sdk`);
    return 2;
  }
  const engine = new SdkEngine();

  const onProgress = options.verbose
    ? (message: string) => {
        console.error(message);
      }
    : undefined;

  // build tolerance config from CLI flags (overrides manifest if set)
  const cliTolerance: ToleranceConfig | undefined =
    options.severityThreshold || options.allowImplicit != null || options.allowExternalRefs != null
      ? {
          severity_threshold: options.severityThreshold as Severity | undefined,
          allow_implicit: options.allowImplicit,
          allow_external_refs: options.allowExternalRefs,
        }
      : undefined;

  const result = await lint({
    projectPath: resolved,
    configPath: options.config,
    contradiction: options.contradiction,
    filterConcernIds,
    tierFilter,
    engine,
    verbose: options.verbose,
    onProgress,
    tolerance: cliTolerance,
    autoDetect: options.autoDetect,
    warnOnMismatch: options.warnOnMismatch,
  });

  const format = options.format ?? "human";

  if (format === "json") {
    console.log(formatLintJson(result));
  } else {
    console.log(await formatLintHuman(result));
  }

  // exit code: 1 if errors found, 0 otherwise
  return result.summary.errors > 0 ? 1 : 0;
}
