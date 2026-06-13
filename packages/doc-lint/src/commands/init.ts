import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import { discoverDocuments, getMissingRequiredRoles, REQUIRED_ROLES } from "../core/discovery.js";
import { buildCodeMap } from "../core/code-scan.js";
import {
  detectSignals,
  detectSignalsFromCode,
  resolveDocumentPaths,
  getAllSignalNames,
} from "../core/signal-keywords.js";

import type { SignalConfidence } from "../core/signal-keywords.js";
import type {
  CodeConfig,
  DocLintManifest,
  DocLintMode,
  DocumentRef,
  InitOptions,
  ProjectClassification,
} from "../types/index.js";

const CLASSIFICATION_OPTIONS: ProjectClassification[] = [
  "standard",
  "financial",
  "healthcare",
  "infrastructure",
];

export interface InitResult {
  projectName: string;
  classification: ProjectClassification;
  mode: DocLintMode;
  documents: {
    required: DocumentRef[];
    optional: DocumentRef[];
  };
  code?: CodeConfig;
  signals: string[];
  manifestPath: string;
}

// format the role display for discovery output
function roleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

// build a manifest object from init results
function buildManifest(result: InitResult): DocLintManifest {
  const manifest: DocLintManifest = {
    version: "1.0",
    project: {
      name: result.projectName,
      classification: result.classification,
    },
    signals: {
      declared: result.signals,
    },
  };

  // mode is omitted for the default (doc-first) to keep manifests back-compatible
  if (result.mode !== "doc-first") {
    manifest.mode = result.mode;
  }

  if (result.documents.required.length > 0 || result.documents.optional.length > 0) {
    manifest.documents = {};
    if (result.documents.required.length > 0) {
      manifest.documents.required = result.documents.required;
    }
    if (result.documents.optional.length > 0) {
      manifest.documents.optional = result.documents.optional;
    }
  }

  if (result.code) {
    manifest.code = result.code;
  }

  return manifest;
}

// format init output for display
export function formatInitOutput(result: InitResult): string {
  const lines: string[] = [];

  lines.push("Initializing doc-lint manifest...\n");

  if (result.mode === "code-first") {
    lines.push("Code-first mode: signals detected from source code.");
    lines.push(`  Source roots: ${(result.code?.paths ?? ["."]).join(", ")}`);
  } else {
    lines.push("Scanning for architecture documents...");
    for (const doc of result.documents.required) {
      lines.push(`  Found: ${doc.path} (${doc.role})`);
    }
    for (const doc of result.documents.optional) {
      lines.push(`  Optional: ${doc.path} (${roleLabel(doc.role)})`);
    }
  }

  lines.push("");
  lines.push(`Project: ${result.projectName}`);
  lines.push(`Mode: ${result.mode}`);
  lines.push(`Classification: ${result.classification}`);
  lines.push(`Signals: ${result.signals.length} declared`);
  lines.push("");
  lines.push(`Created ${path.basename(result.manifestPath)}`);

  if (result.mode === "code-first") {
    lines.push("");
    lines.push("No authored docs — this project is in code-first onboarding.");
    lines.push("Next: run `doc-lint bootstrap` to scaffold as-built docs + a gap inventory.");
    lines.push("(`doc-lint lint` requires authored docs and a doc-first/reconcile manifest.)");
  }

  return lines.join("\n");
}

// code-first fallback: no architecture docs found, so detect signals from the
// codebase and produce a code-first manifest.
async function initCodeFirst(projectPath: string): Promise<InitResult> {
  const codeMap = await buildCodeMap(projectPath);
  const detected = detectSignalsFromCode(codeMap);
  const selected = detected.filter((s) => s.confidence === "high" || s.confidence === "medium");

  if (selected.length === 0) {
    throw new Error(
      "No architecture documents found and no signals could be detected from the codebase. " +
        "Add docs (brd/frd/add) or ensure the source uses recognizable frameworks/dependencies.",
    );
  }

  return {
    projectName: path.basename(projectPath),
    classification: "standard",
    mode: "code-first",
    documents: { required: [], optional: [] },
    code: { paths: ["."] },
    signals: selected.map((s) => s.signal),
    manifestPath: path.resolve(projectPath, "doc-lint.yaml"),
  };
}

// run the init command in non-interactive (--yes) mode
async function initNonInteractive(
  projectPath: string,
  ignorePatterns?: string[],
): Promise<InitResult> {
  const discovery = await discoverDocuments(projectPath, ignorePatterns);
  const missingRequired = getMissingRequiredRoles(discovery);

  // no architecture docs at all → fall back to code-first. but if the user explicitly
  // excluded docs via --ignore, that is a filter, not an absence — surface the
  // missing-docs error rather than silently switching the project to code-first.
  if (missingRequired.length === REQUIRED_ROLES.length && !ignorePatterns?.length) {
    return initCodeFirst(projectPath);
  }

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required documents for roles: ${missingRequired.join(", ")}.\n` +
      `Run without --yes to provide file paths manually, or create documents matching these roles:\n` +
      missingRequired.map((r) => `  - ${r}`).join("\n"),
    );
  }

  // collect all discovered file paths for signal scanning
  const allPaths: string[] = [];
  const requiredDocs: DocumentRef[] = [];
  const optionalDocs: DocumentRef[] = [];

  for (const role of REQUIRED_ROLES) {
    const candidates = discovery.candidates[role]!;
    // use first match for --yes mode
    const chosen = candidates[0]!;
    requiredDocs.push({ role, path: chosen });
    allPaths.push(chosen);
  }

  // add optional roles
  for (const [role, candidates] of Object.entries(discovery.candidates)) {
    if (REQUIRED_ROLES.includes(role as (typeof REQUIRED_ROLES)[number])) continue;
    const chosen = candidates[0]!;
    optionalDocs.push({ role, path: chosen });
    allPaths.push(chosen);
  }

  // detect signals
  const absolutePaths = resolveDocumentPaths(projectPath, allPaths);
  const detected = detectSignals(absolutePaths);

  // include high + medium confidence
  const selected = detected.filter(
    (s) => s.confidence === "high" || s.confidence === "medium",
  );

  if (selected.length === 0) {
    throw new Error(
      "No signals detected. Run without --yes to select signals manually, " +
      "or check that your documents contain domain-specific terminology.",
    );
  }

  const projectName = path.basename(projectPath);

  return {
    projectName,
    classification: "standard",
    mode: "doc-first",
    documents: { required: requiredDocs, optional: optionalDocs },
    signals: selected.map((s) => s.signal),
    manifestPath: path.resolve(projectPath, "doc-lint.yaml"),
  };
}

// run the init command in interactive mode
async function initInteractive(
  projectPath: string,
  ignorePatterns?: string[],
): Promise<InitResult> {
  const { input, confirm, checkbox, select } = await import("@inquirer/prompts");

  console.log("\nInitializing doc-lint manifest...\n");
  console.log("Scanning for architecture documents...");

  const discovery = await discoverDocuments(projectPath, ignorePatterns);

  // no architecture docs at all → offer code-first (but not when the user explicitly
  // excluded docs via --ignore; that is a filter, not an absence)
  if (getMissingRequiredRoles(discovery).length === REQUIRED_ROLES.length && !ignorePatterns?.length) {
    const useCodeFirst = await confirm({
      message: "No architecture documents (brd/frd/add) found. Initialize in code-first mode (detect signals from source)?",
      default: true,
    });
    if (useCodeFirst) {
      console.log("\nScanning source code for signals...");
      const result = await initCodeFirst(projectPath);
      console.log(`  Detected signals: ${result.signals.join(", ")}`);
      const projectName = await input({ message: "Project name:", default: result.projectName });
      return { ...result, projectName };
    }
  }

  // handle required roles
  const requiredDocs: DocumentRef[] = [];
  const optionalDocs: DocumentRef[] = [];
  const allPaths: string[] = [];

  for (const role of REQUIRED_ROLES) {
    const candidates = discovery.candidates[role];

    if (!candidates || candidates.length === 0) {
      // prompt for manual path
      const manualPath = await input({
        message: `No ${role} document found. Enter path to your ${role} document:`,
        validate: (value: string) => {
          if (!value.trim()) return `Path is required for ${role}`;
          const abs = path.resolve(projectPath, value);
          if (!fs.existsSync(abs)) return `File not found: ${value}`;
          return true;
        },
      });
      requiredDocs.push({ role, path: manualPath });
      allPaths.push(manualPath);
    } else if (candidates.length === 1) {
      console.log(`  Found: ${candidates[0]} (${role})`);
      requiredDocs.push({ role, path: candidates[0]! });
      allPaths.push(candidates[0]!);
    } else {
      // multiple candidates - let user pick
      const chosen = await select({
        message: `Multiple candidates for ${role}. Pick one:`,
        choices: candidates.map((c) => ({ name: c, value: c })),
      });
      requiredDocs.push({ role, path: chosen });
      allPaths.push(chosen);
    }
  }

  // handle optional roles
  for (const [role, candidates] of Object.entries(discovery.candidates)) {
    if (REQUIRED_ROLES.includes(role as (typeof REQUIRED_ROLES)[number])) continue;
    if (!candidates || candidates.length === 0) continue;

    const chosen = candidates.length === 1
      ? candidates[0]!
      : await select({
          message: `Multiple candidates for ${roleLabel(role)}. Pick one:`,
          choices: candidates.map((c) => ({ name: c, value: c })),
        });

    console.log(`  Optional: ${chosen} (${roleLabel(role)})`);
    optionalDocs.push({ role, path: chosen });
    allPaths.push(chosen);
  }

  // detect signals
  console.log("\nScanning documents for signals...");
  const absolutePaths = resolveDocumentPaths(projectPath, allPaths);
  const detected = detectSignals(absolutePaths);

  let selectedSignals: string[];

  if (detected.length === 0) {
    // no signals detected - let user pick from full list
    console.log("  No signals auto-detected from document content.");
    const allSignals = getAllSignalNames();
    selectedSignals = await checkbox({
      message: "Select signals that apply to your project:",
      choices: allSignals.map((s) => ({ name: s, value: s })),
    });

    if (selectedSignals.length === 0) {
      throw new Error("At least one signal is required.");
    }
  } else {
    // show detected signals grouped by confidence
    for (const tier of ["high", "medium", "low"] as SignalConfidence[]) {
      const group = detected.filter((s) => s.confidence === tier);
      if (group.length > 0) {
        console.log(`  Detected (${tier}):    ${group.map((s) => s.signal).join(", ")}`);
      }
    }

    // let user confirm/toggle signals
    selectedSignals = await checkbox({
      message: "Confirm detected signals:",
      choices: detected.map((s) => ({
        name: `${s.signal} (${s.confidence})`,
        value: s.signal,
        checked: s.confidence === "high" || s.confidence === "medium",
      })),
    });

    if (selectedSignals.length === 0) {
      throw new Error("At least one signal is required.");
    }
  }

  // project name
  const defaultName = path.basename(projectPath);
  const projectName = await input({
    message: "Project name:",
    default: defaultName,
  });

  // classification
  const classification = await select({
    message: "Project classification:",
    choices: CLASSIFICATION_OPTIONS.map((c) => ({ name: c, value: c })),
    default: "standard",
  });

  return {
    projectName,
    classification,
    mode: "doc-first",
    documents: { required: requiredDocs, optional: optionalDocs },
    signals: selectedSignals,
    manifestPath: path.resolve(projectPath, "doc-lint.yaml"),
  };
}

export async function initCommand(
  projectPath: string | undefined,
  options: InitOptions,
): Promise<number> {
  const resolved = path.resolve(projectPath ?? ".");
  const manifestPath = path.resolve(resolved, "doc-lint.yaml");

  // check for existing manifest
  if (fs.existsSync(manifestPath)) {
    if (options.yes) {
      // overwrite silently in --yes mode
    } else {
      const { confirm } = await import("@inquirer/prompts");
      const overwrite = await confirm({
        message: "doc-lint.yaml already exists. Overwrite?",
        default: false,
      });
      if (!overwrite) {
        console.log("Aborted.");
        return 0;
      }
    }
  }

  try {
    const result = options.yes
      ? await initNonInteractive(resolved, options.ignore)
      : await initInteractive(resolved, options.ignore);

    const manifest = buildManifest(result);
    const yamlContent = yaml.dump(manifest, {
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
    });

    fs.writeFileSync(manifestPath, yamlContent, "utf8");
    console.log(formatInitOutput(result));

    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 2;
  }
}
