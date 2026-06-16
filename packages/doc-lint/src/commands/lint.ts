import * as path from "node:path";

import { assemble, lint } from "../core/evaluator.js";
import { formatAssembleHuman, formatLintHuman } from "../formatters/human.js";
import { formatAssembleJson, formatLintJson } from "../formatters/json.js";
import { SdkEngine } from "../core/engine/sdk-engine.js";
import { AnthropicAgentEngine } from "../core/engine/agent-engine.js";
import { loadManifest } from "../core/manifest.js";

import type { LintOptions, ToleranceConfig, Severity, DocLintMode, Lens } from "../types/index.js";
import type { EvaluationEngine } from "../core/engine/types.js";
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

  const mode = options.mode as DocLintMode | undefined;
  const codePaths = options.code
    ? options.code.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const VALID_LENSES: Lens[] = ["docs", "code", "reconcile"];
  if (options.lens && !VALID_LENSES.includes(options.lens as Lens)) {
    console.error(
      `Error: invalid --lens value "${options.lens}". Use one of: ${VALID_LENSES.join(", ")}`,
    );
    return 2;
  }
  const lens = options.lens as Lens | undefined;

  // code-first is an onboarding mode, not a lint mode — redirect to `bootstrap`.
  let effectiveMode = mode;
  if (!effectiveMode) {
    try {
      effectiveMode = loadManifest(resolved, options.config).mode;
    } catch {
      // no manifest yet; let downstream surface the error
    }
  }
  if (effectiveMode === "code-first") {
    console.error(
      "This is a code-first project (no authored docs to lint).\n" +
        "Run `doc-lint bootstrap` to scaffold as-built docs + a documentation gap inventory,\n" +
        "fill in the intent (TODOs), then lint in doc-first or reconcile mode.",
    );
    return 2;
  }

  // dry-run mode: show matched concerns without evaluating
  if (options.dryRun) {
    const result = await assemble({
      projectPath: resolved,
      configPath: options.config,
      contradiction: options.contradiction,
      drift: options.drift,
      filterConcernIds,
      tierFilter,
      tierCumulative: options.tierCumulative,
      autoDetect: options.autoDetect,
      warnOnMismatch: options.warnOnMismatch,
      mode,
      codePaths,
      lens,
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
  let engine: EvaluationEngine;
  if (engineName === "sdk") {
    engine = new SdkEngine();
  } else if (engineName === "agent") {
    // agentic engine reads real source on demand — no inline content / code map needed
    engine = new AnthropicAgentEngine();
  } else {
    console.error(`Unknown engine: "${String(engineName)}". Supported engines: sdk, agent`);
    return 2;
  }

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
    drift: options.drift,
    filterConcernIds,
    tierFilter,
    tierCumulative: options.tierCumulative,
    mode,
    codePaths,
    lens,
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
