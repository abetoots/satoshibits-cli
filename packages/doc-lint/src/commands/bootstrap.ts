import * as path from "node:path";

import { buildCodeMap } from "../core/code-scan.js";
import { buildBootstrapDocs, writeBootstrapDocs } from "../core/bootstrap.js";
import { loadAllConcerns } from "../core/concerns.js";
import { matchConcerns } from "../core/signals.js";
import { findManifestPath, loadManifest } from "../core/manifest.js";
import { detectSignalsFromCode } from "../core/signal-keywords.js";

import type { CodeConfig } from "../types/index.js";

export interface BootstrapOptions {
  out?: string; // output directory (default .doc-lint/bootstrap)
  code?: string; // comma-separated source roots
  ignore?: string; // comma-separated extra ignores
  config?: string;
}

// `doc-lint bootstrap` — the code-first on-ramp. Deterministically scaffolds
// evidence-named as-built docs + a documentation gap inventory from a static code
// scan. No LLM, no API key. The human fills in the TODOs, then lints in doc-first
// or reconcile mode.
export async function bootstrapCommand(
  projectPath: string | undefined,
  options: BootstrapOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");

  // signals + code config come from the manifest if one exists; otherwise we detect
  // signals from the code itself (a bare repo with no docs and no manifest still works).
  let signals: string[] | undefined;
  let codeConfig: CodeConfig | undefined;
  try {
    findManifestPath(resolved, options.config);
    const manifest = loadManifest(resolved, options.config);
    signals = manifest.signals.declared;
    codeConfig = manifest.code;
  } catch {
    // no manifest — fall through to code-derived signals
  }

  const paths = options.code?.split(",").map((s) => s.trim()).filter(Boolean) ?? codeConfig?.paths;
  const ignore = options.ignore?.split(",").map((s) => s.trim()).filter(Boolean) ?? codeConfig?.ignore;

  const codeMap = await buildCodeMap(resolved, {
    paths,
    ignore,
    entrypoints: codeConfig?.entrypoints,
  });

  if (!signals || signals.length === 0) {
    signals = detectSignalsFromCode(codeMap)
      .filter((s) => s.confidence === "high" || s.confidence === "medium")
      .map((s) => s.signal);
  }

  const { matched } = matchConcerns(signals, loadAllConcerns());
  const docs = buildBootstrapDocs(codeMap, signals, matched);

  const outDir = options.out ?? ".doc-lint/bootstrap";
  const written = writeBootstrapDocs(docs, resolved, outDir);

  console.log("doc-lint bootstrap (code-first on-ramp)");
  console.log(`  Detected signals: ${signals.join(", ") || "(none)"}`);
  console.log(`  Concerns applicable: ${matched.length}`);
  console.log("  Wrote scaffold:");
  for (const f of written) console.log(`    ${path.relative(resolved, f)}`);
  console.log("");
  console.log("Next — bootstrap can't author intent for you, so by hand:");
  console.log(`  1. Review the scaffolds in ${outDir}, fill in the TODO (human intent) blocks`);
  console.log("     and work through doc-todos.md (the documentation gap inventory).");
  console.log("  2. In doc-lint.yaml, point `documents:` at your authored docs and set");
  console.log("     `mode: doc-first` (or `mode: reconcile` to also check docs against code).");
  console.log("  3. Then run `doc-lint lint .` (or `doc-lint reconcile .`).");
  console.log("");
  console.log("Until the manifest leaves code-first mode, `lint` will redirect back here.");

  return 0;
}
