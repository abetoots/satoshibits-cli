import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import { discoverDocuments, getMissingRequiredRoles, REQUIRED_ROLES } from "../core/discovery.js";
import {
  detectSignals,
  resolveDocumentPaths,
  getAllSignalNames,
} from "../core/signal-keywords.js";

import type { InitOptions } from "../types/index.js";
import type { DetectedSignal, SignalConfidence } from "../core/signal-keywords.js";
import type { DocLintManifest, DocumentRef, ProjectClassification } from "../types/index.js";

const CLASSIFICATION_OPTIONS: ProjectClassification[] = [
  "standard",
  "financial",
  "healthcare",
  "infrastructure",
];

export interface InitResult {
  projectName: string;
  classification: ProjectClassification;
  documents: {
    required: DocumentRef[];
    optional: DocumentRef[];
  };
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
    documents: {
      required: result.documents.required,
    },
    signals: {
      declared: result.signals,
    },
  };

  if (result.documents.optional.length > 0) {
    manifest.documents.optional = result.documents.optional;
  }

  return manifest;
}

// format init output for display
export function formatInitOutput(result: InitResult): string {
  const lines: string[] = [];

  lines.push("Initializing doc-lint manifest...\n");
  lines.push("Scanning for architecture documents...");

  for (const doc of result.documents.required) {
    lines.push(`  Found: ${doc.path} (${doc.role})`);
  }
  for (const doc of result.documents.optional) {
    lines.push(`  Optional: ${doc.path} (${roleLabel(doc.role)})`);
  }

  lines.push("");
  lines.push(`Project: ${result.projectName}`);
  lines.push(`Classification: ${result.classification}`);
  lines.push(`Signals: ${result.signals.length} declared`);
  lines.push("");
  lines.push(`Created ${path.basename(result.manifestPath)}`);

  return lines.join("\n");
}

// run the init command in non-interactive (--yes) mode
async function initNonInteractive(
  projectPath: string,
  ignorePatterns?: string[],
): Promise<InitResult> {
  const discovery = await discoverDocuments(projectPath, ignorePatterns);
  const missingRequired = getMissingRequiredRoles(discovery);

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
