import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

import { IGNORE_PATTERNS, isValidFile } from "./discovery.js";

import type {
  ApiSurfaceItem,
  CodeMap,
  CodeScanOptions,
  ExternalCallInfo,
  ModelInfo,
  PackageInfo,
  RouteInfo,
} from "../types/code-map.js";

// extra ignores beyond the doc-discovery set — tests, fixtures, minified, lockfiles
const SOURCE_IGNORE_PATTERNS = [
  ...IGNORE_PATTERNS,
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/fixtures/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.lock",
  "**/*-lock.json",
  "**/*-lock.yaml",
  "**/.turbo/**",
  "**/.cache/**",
];

// code file extensions we run regex extractors against
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rb", ".java", ".kt", ".rs", ".php", ".cs",
  ".prisma",
]);

// the subset we have JS/TS-aware regex extractors for
const JS_TS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".prisma"];

// tree rendering caps keep the map small on large repos
const TREE_MAX_DEPTH = 4;
const TREE_MAX_FANOUT = 40;

// config/infra files whose mere presence is a signal
const CONFIG_FILE_MATCHERS: { test: (rel: string) => boolean; label: string }[] = [
  { test: (r) => /(^|\/)dockerfile$/i.test(r), label: "docker" },
  { test: (r) => /docker-compose\.ya?ml$/i.test(r), label: "docker-compose" },
  { test: (r) => /\.tf$/i.test(r), label: "terraform" },
  { test: (r) => /(^|\/)(k8s|kubernetes)\//i.test(r), label: "kubernetes" },
  { test: (r) => /\.github\/workflows\//i.test(r), label: "github-actions" },
  { test: (r) => /(^|\/)serverless\.ya?ml$/i.test(r), label: "serverless" },
  { test: (r) => /(^|\/)\.env(\.|$)/i.test(r), label: "dotenv" },
];

interface ScanContext {
  routes: RouteInfo[];
  models: ModelInfo[];
  externalCalls: ExternalCallInfo[];
  apiSurface: ApiSurfaceItem[];
  envVars: Set<string>;
}

// build a lightweight, language-agnostic map of a codebase. tier-1 only: cheap
// regex/heuristics, never whole-file bodies. bounded in size by construction.
export async function buildCodeMap(
  projectPath: string,
  opts: CodeScanOptions = {},
): Promise<CodeMap> {
  const roots = opts.paths && opts.paths.length > 0 ? opts.paths : ["."];
  const ignore = [...SOURCE_IGNORE_PATTERNS, ...(opts.ignore ?? [])];

  // collect all candidate files across roots (deduped, relative to projectPath)
  const relFiles = new Set<string>();
  for (const root of roots) {
    const pattern = root === "." ? "**/*" : `${root.replace(/\/$/, "")}/**/*`;
    const found = await glob(pattern, {
      cwd: projectPath,
      ignore,
      nodir: true,
      dot: true, // surface .github, .env, etc.; ignores still exclude .git/.next/...
    });
    for (const f of found) relFiles.add(f);
  }

  const allFiles = [...relFiles].sort();
  const ctx: ScanContext = {
    routes: [],
    models: [],
    externalCalls: [],
    apiSurface: [],
    envVars: new Set(),
  };

  const scannedPaths: string[] = [];
  const unsupportedLanguages = new Set<string>();
  const configSignals = new Set<string>();
  const packages: PackageInfo[] = [];

  for (const rel of allFiles) {
    const abs = path.resolve(projectPath, rel);

    // config/infra presence signals (no read needed)
    for (const matcher of CONFIG_FILE_MATCHERS) {
      if (matcher.test(rel)) configSignals.add(matcher.label);
    }

    if (path.basename(rel) === "package.json" && isValidFile(abs)) {
      const pkg = parsePackageJson(abs, rel);
      if (pkg) packages.push(pkg);
      scannedPaths.push(rel);
      continue;
    }

    const ext = path.extname(rel).toLowerCase();
    if (!CODE_EXTENSIONS.has(ext)) {
      // note source-ish languages we can see but don't extract from
      if (ext && !isValidFile(abs)) continue;
      continue;
    }
    if (!isValidFile(abs)) continue;

    let content: string;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }

    // we only run JS/TS-aware extractors; flag other code languages as
    // present-but-unsupported so coverage stays honest
    if (!JS_TS_EXTENSIONS.includes(ext)) {
      unsupportedLanguages.add(ext);
      scannedPaths.push(rel);
      continue;
    }

    extractFromFile(rel, content, ctx);
    scannedPaths.push(rel);
  }

  const entrypoints = collectEntrypoints(packages, opts.entrypoints);
  const tree = renderTree(allFiles);

  return {
    root: projectPath,
    tree,
    packages,
    entrypoints,
    routes: ctx.routes,
    models: ctx.models,
    externalCalls: ctx.externalCalls,
    apiSurface: ctx.apiSurface,
    envVars: [...ctx.envVars].sort(),
    configSignals: [...configSignals].sort(),
    fileCount: allFiles.length,
    sampledFiles: scannedPaths.length,
    coverage: {
      scannedPaths,
      ignoredPaths: ignore,
      sampledOutPaths: [], // tier-1 scans everything; populated by tier-2 budget (phase 4)
      unsupportedLanguages: [...unsupportedLanguages].sort(),
    },
  };
}

function parsePackageJson(abs: string, rel: string): PackageInfo | null {
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
    return {
      name: typeof raw.name === "string" ? raw.name : path.dirname(rel),
      path: rel,
      dependencies: Object.keys((raw.dependencies as object) ?? {}),
      devDependencies: Object.keys((raw.devDependencies as object) ?? {}),
      scripts: (raw.scripts as Record<string, string>) ?? {},
      engines: (raw.engines as Record<string, string>) ?? {},
    };
  } catch {
    return null;
  }
}

function collectEntrypoints(packages: PackageInfo[], hints?: string[]): string[] {
  const entries = new Set<string>(hints ?? []);
  for (const pkg of packages) {
    const start = pkg.scripts.start;
    const dev = pkg.scripts.dev;
    if (start) entries.add(`${pkg.name}: start → ${start}`);
    if (dev) entries.add(`${pkg.name}: dev → ${dev}`);
  }
  return [...entries].sort();
}

// regex extractors. each captures file:line + a short snippet, never the body.
const ROUTE_RE = /\b(?:app|router|fastify|server|api)\s*\.\s*(get|post|put|delete|patch|all|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/i;
const DECORATOR_ROUTE_RE = /@(Get|Post|Put|Delete|Patch|Controller|All)\s*\(\s*(?:['"`]([^'"`]*)['"`])?/;
const PRISMA_MODEL_RE = /^\s*model\s+(\w+)\s*\{/;
const MONGOOSE_RE = /new\s+(?:mongoose\.)?Schema\s*\(|mongoose\s*\.\s*model\s*\(\s*['"`](\w+)['"`]/;
const TYPEORM_RE = /@Entity\s*\(/;
const DRIZZLE_RE = /\b(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*['"`](\w+)['"`]/;
const STRIPE_RE = /new\s+Stripe\s*\(/;
const HTTP_CALL_RE = /\b(?:axios|got|ky)\s*\.\s*(get|post|put|delete|patch|request)\s*\(|\bfetch\s*\(/i;
const URL_LITERAL_RE = /['"`](https?:\/\/[^'"`\s]+)['"`]/i;
const EXPORT_RE = /\bexport\s+(?:default\s+)?(?:async\s+)?(function|class|const)\s+(\w+)/;
const ENV_RE = /process\.env\.(\w+)|process\.env\[\s*['"`](\w+)['"`]\s*\]|import\.meta\.env\.(\w+)/g;

function extractFromFile(rel: string, content: string, ctx: ScanContext): void {
  const lines = content.split(/\r?\n/);
  const ext = path.extname(rel).toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;
    if (line.length > 1000) continue; // skip pathological/minified lines

    if (ext === ".prisma") {
      const m = PRISMA_MODEL_RE.exec(line);
      if (m) {
        ctx.models.push({ name: m[1]!, orm: "prisma", file: rel, line: lineNo, confidence: "high" });
      }
      continue;
    }

    let m: RegExpExecArray | null;

    if ((m = ROUTE_RE.exec(line))) {
      ctx.routes.push({
        method: m[1]!.toUpperCase(),
        path: m[2]!,
        file: rel,
        line: lineNo,
        confidence: "high",
      });
    } else if ((m = DECORATOR_ROUTE_RE.exec(line))) {
      ctx.routes.push({
        method: m[1]!.toUpperCase(),
        path: m[2] ?? "",
        file: rel,
        line: lineNo,
        confidence: "medium",
      });
    }

    if ((m = MONGOOSE_RE.exec(line))) {
      ctx.models.push({
        name: m[1] ?? path.basename(rel, ext),
        orm: "mongoose",
        file: rel,
        line: lineNo,
        confidence: m[1] ? "high" : "medium",
      });
    } else if (TYPEORM_RE.test(line)) {
      ctx.models.push({ name: nextSymbol(lines, i) ?? "unknown", orm: "typeorm", file: rel, line: lineNo, confidence: "medium" });
    } else if ((m = DRIZZLE_RE.exec(line))) {
      ctx.models.push({ name: m[2]!, orm: "drizzle", file: rel, line: lineNo, confidence: "high" });
    }

    if (STRIPE_RE.test(line)) {
      ctx.externalCalls.push({ target: "stripe", kind: "sdk", file: rel, line: lineNo, confidence: "high" });
    }
    if ((m = HTTP_CALL_RE.exec(line))) {
      ctx.externalCalls.push({ target: m[0].includes("fetch") ? "fetch" : "http-client", kind: "http", file: rel, line: lineNo, confidence: "medium" });
    }
    if ((m = URL_LITERAL_RE.exec(line)) && !/localhost|127\.0\.0\.1/.test(m[1]!)) {
      ctx.externalCalls.push({ target: m[1]!, kind: "url", file: rel, line: lineNo, confidence: "low" });
    }

    if ((m = EXPORT_RE.exec(line))) {
      ctx.apiSurface.push({
        name: m[2]!,
        kind: m[1]!,
        snippet: line.trim().slice(0, 200),
        file: rel,
        line: lineNo,
        confidence: "high",
      });
    }

    ENV_RE.lastIndex = 0;
    let envMatch: RegExpExecArray | null;
    while ((envMatch = ENV_RE.exec(line))) {
      const name = envMatch[1] ?? envMatch[2] ?? envMatch[3];
      if (name) ctx.envVars.add(name);
    }
  }
}

// look ahead a few lines for the class/symbol a decorator applies to
function nextSymbol(lines: string[], idx: number): string | undefined {
  for (let j = idx; j < Math.min(idx + 4, lines.length); j++) {
    const m = /\b(?:class|const|export)\s+(?:default\s+)?(?:class\s+)?(\w+)/.exec(lines[j]!);
    if (m) return m[1];
  }
  return undefined;
}

// render a pruned directory tree from relative file paths
function renderTree(relFiles: string[]): string {
  interface Node { dirs: Map<string, Node>; files: string[] }
  const root: Node = { dirs: new Map(), files: [] };

  for (const rel of relFiles) {
    const parts = rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i]!;
      if (!node.dirs.has(dir)) node.dirs.set(dir, { dirs: new Map(), files: [] });
      node = node.dirs.get(dir)!;
    }
    node.files.push(parts[parts.length - 1]!);
  }

  const out: string[] = [];
  const walk = (node: Node, prefix: string, depth: number): void => {
    if (depth > TREE_MAX_DEPTH) {
      out.push(`${prefix}…`);
      return;
    }
    const dirNames = [...node.dirs.keys()].sort();
    for (const dir of dirNames.slice(0, TREE_MAX_FANOUT)) {
      out.push(`${prefix}${dir}/`);
      walk(node.dirs.get(dir)!, `${prefix}  `, depth + 1);
    }
    if (dirNames.length > TREE_MAX_FANOUT) {
      out.push(`${prefix}… (+${dirNames.length - TREE_MAX_FANOUT} dirs)`);
    }
    const files = node.files.sort();
    for (const file of files.slice(0, TREE_MAX_FANOUT)) {
      out.push(`${prefix}${file}`);
    }
    if (files.length > TREE_MAX_FANOUT) {
      out.push(`${prefix}… (+${files.length - TREE_MAX_FANOUT} files)`);
    }
  };

  walk(root, "", 0);
  return out.join("\n");
}
