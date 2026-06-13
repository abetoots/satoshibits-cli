import * as path from "node:path";

import { buildCodeMap } from "../core/code-scan.js";

import type { CodeMap } from "../types/index.js";

export interface ScanOptions {
  format?: "human" | "json";
  code?: string; // comma-separated source roots
  ignore?: string; // comma-separated extra ignores
}

// `doc-lint scan` — read-only, no LLM. the code analog of `assemble`:
// shows the code map that the drift scanner and `bootstrap` consume.
export async function scanCommand(
  projectPath: string | undefined,
  options: ScanOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");
  const paths = options.code?.split(",").map((s) => s.trim()).filter(Boolean);
  const ignore = options.ignore?.split(",").map((s) => s.trim()).filter(Boolean);

  const codeMap = await buildCodeMap(resolved, { paths, ignore });

  const format = options.format ?? "human";
  if (format === "json") {
    console.log(JSON.stringify(codeMap, null, 2));
  } else {
    console.log(await formatCodeMapHuman(codeMap));
  }

  return 0;
}

export async function formatCodeMapHuman(map: CodeMap): Promise<string> {
  const chalk = (await import("chalk")).default;
  const lines: string[] = [];

  lines.push(chalk.bold(`doc-lint scan: ${map.root}`));
  lines.push(
    chalk.dim(
      `Files: ${map.fileCount} total, ${map.sampledFiles} scanned` +
        (map.coverage.unsupportedLanguages.length > 0
          ? `, unsupported: ${map.coverage.unsupportedLanguages.join(", ")}`
          : ""),
    ),
  );
  lines.push("");

  if (map.packages.length > 0) {
    lines.push(chalk.bold("Packages"));
    for (const pkg of map.packages) {
      const deps = pkg.dependencies.slice(0, 12).join(", ");
      lines.push(`  ${chalk.cyan(pkg.name)} ${chalk.dim(`(${pkg.dependencies.length} deps)`)}`);
      if (deps) lines.push(`    ${chalk.dim(deps)}${pkg.dependencies.length > 12 ? " …" : ""}`);
    }
    lines.push("");
  }

  section(lines, chalk.bold("Routes"), map.routes.map((r) => `${r.method} ${r.path} ${chalk.dim(`(${r.file}:${r.line})`)}`));
  section(lines, chalk.bold("Models"), map.models.map((m) => `${m.name} ${chalk.dim(`[${m.orm}] (${m.file}:${m.line})`)}`));
  section(lines, chalk.bold("External calls"), dedupe(map.externalCalls.map((c) => `${c.target} ${chalk.dim(`[${c.kind}] (${c.file}:${c.line})`)}`)));
  section(lines, chalk.bold("Env vars"), map.envVars.map((e) => String(e)));
  if (map.configSignals.length > 0) {
    section(lines, chalk.bold("Config/infra"), map.configSignals.map((c) => String(c)));
  }

  lines.push("");
  lines.push(chalk.bold("Tree"));
  lines.push(chalk.dim(map.tree));

  return lines.join("\n");
}

function section(lines: string[], header: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(`${header} ${`(${items.length})`}`);
  for (const item of items.slice(0, 50)) lines.push(`  ${item}`);
  if (items.length > 50) lines.push(`  … (+${items.length - 50} more)`);
  lines.push("");
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
