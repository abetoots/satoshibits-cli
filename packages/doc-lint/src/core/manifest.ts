import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import type { DocLintManifest, DocumentRef } from "../types/index.js";

const MANIFEST_FILENAMES = ["doc-lint.yaml", "doc-lint.yml"];
const VALID_CLASSIFICATIONS = ["standard", "financial", "healthcare", "infrastructure"];
const VALID_SEVERITY_THRESHOLDS = ["error", "warn", "note"];
const VALID_MODES = ["doc-first", "code-first", "reconcile"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function findManifestPath(projectPath: string, configPath?: string): string {
  if (configPath) {
    const resolved = path.resolve(projectPath, configPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`);
    }
    return resolved;
  }

  for (const filename of MANIFEST_FILENAMES) {
    const candidate = path.resolve(projectPath, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No doc-lint manifest found in ${projectPath}. Expected one of: ${MANIFEST_FILENAMES.join(", ")}`,
  );
}

export function loadManifest(projectPath: string, configPath?: string): DocLintManifest {
  const manifestPath = findManifestPath(projectPath, configPath);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed: unknown = yaml.load(raw);
  return validateManifest(parsed, manifestPath);
}

function validateManifest(data: unknown, filePath: string): DocLintManifest {
  if (typeof data !== "object" || data === null) {
    throw new Error(`Invalid manifest at ${filePath}: expected an object`);
  }

  // one intermediate record for top-level property access
  const obj: Record<string, unknown> = data as Record<string, unknown>;

  // version
  if (typeof obj.version !== "string" || !obj.version) {
    throw new Error(`Invalid manifest at ${filePath}: missing or invalid 'version'`);
  }

  // mode (optional; defaults to doc-first)
  if (obj.mode != null && (typeof obj.mode !== "string" || !VALID_MODES.includes(obj.mode))) {
    throw new Error(
      `Invalid manifest at ${filePath}: 'mode' must be one of: ${VALID_MODES.join(", ")}`,
    );
  }
  const mode = (obj.mode as string | undefined) ?? "doc-first";

  // code (optional; validate shape if present)
  if (obj.code != null) {
    if (!isRecord(obj.code)) {
      throw new Error(`Invalid manifest at ${filePath}: 'code' must be an object`);
    }
    for (const arrayField of ["paths", "ignore", "entrypoints"] as const) {
      const value = obj.code[arrayField];
      if (value != null && (!Array.isArray(value) || value.some((v) => typeof v !== "string"))) {
        throw new Error(
          `Invalid manifest at ${filePath}: 'code.${arrayField}' must be an array of strings`,
        );
      }
    }
    if (obj.code.maxInputTokens != null && typeof obj.code.maxInputTokens !== "number") {
      throw new Error(`Invalid manifest at ${filePath}: 'code.maxInputTokens' must be a number`);
    }
  }

  // project
  if (!isRecord(obj.project)) {
    throw new Error(`Invalid manifest at ${filePath}: missing 'project'`);
  }
  if (typeof obj.project.name !== "string" || !obj.project.name) {
    throw new Error(`Invalid manifest at ${filePath}: missing 'project.name'`);
  }

  // project.classification (optional)
  if (obj.project.classification != null) {
    if (
      typeof obj.project.classification !== "string" ||
      !VALID_CLASSIFICATIONS.includes(obj.project.classification)
    ) {
      throw new Error(
        `Invalid manifest at ${filePath}: 'project.classification' must be one of: ${VALID_CLASSIFICATIONS.join(", ")}`,
      );
    }
  }

  // documents — required in doc-first/reconcile (we need docs to evaluate/compare);
  // optional in code-first (scaffold them with `doc-lint bootstrap`).
  const docsRequiredByMode = mode !== "code-first";
  if (obj.documents == null) {
    if (docsRequiredByMode) {
      throw new Error(`Invalid manifest at ${filePath}: missing 'documents'`);
    }
  } else {
    if (!isRecord(obj.documents)) {
      throw new Error(`Invalid manifest at ${filePath}: 'documents' must be an object`);
    }
    validateDocumentsBlock(obj.documents, filePath, mode);
  }

  // signals
  if (!isRecord(obj.signals)) {
    throw new Error(`Invalid manifest at ${filePath}: missing 'signals'`);
  }
  if (!Array.isArray(obj.signals.declared) || obj.signals.declared.length === 0) {
    throw new Error(`Invalid manifest at ${filePath}: 'signals.declared' must be a non-empty array`);
  }
  for (const signal of obj.signals.declared) {
    if (typeof signal !== "string") {
      throw new Error(`Invalid manifest at ${filePath}: each signal must be a string`);
    }
  }

  // signals.auto_detect / warn_on_mismatch (optional booleans)
  if (obj.signals.auto_detect != null && typeof obj.signals.auto_detect !== "boolean") {
    throw new Error(
      `Invalid manifest at ${filePath}: 'signals.auto_detect' must be a boolean`,
    );
  }
  if (obj.signals.warn_on_mismatch != null && typeof obj.signals.warn_on_mismatch !== "boolean") {
    throw new Error(
      `Invalid manifest at ${filePath}: 'signals.warn_on_mismatch' must be a boolean`,
    );
  }

  // tolerance (optional)
  if (obj.tolerance != null) {
    if (!isRecord(obj.tolerance)) {
      throw new Error(`Invalid manifest at ${filePath}: 'tolerance' must be an object`);
    }
    if (
      obj.tolerance.severity_threshold != null &&
      (typeof obj.tolerance.severity_threshold !== "string" ||
        !VALID_SEVERITY_THRESHOLDS.includes(obj.tolerance.severity_threshold))
    ) {
      throw new Error(
        `Invalid manifest at ${filePath}: 'tolerance.severity_threshold' must be one of: ${VALID_SEVERITY_THRESHOLDS.join(", ")}`,
      );
    }
    if (obj.tolerance.allow_implicit != null && typeof obj.tolerance.allow_implicit !== "boolean") {
      throw new Error(
        `Invalid manifest at ${filePath}: 'tolerance.allow_implicit' must be a boolean`,
      );
    }
    if (
      obj.tolerance.allow_external_refs != null &&
      typeof obj.tolerance.allow_external_refs !== "boolean"
    ) {
      throw new Error(
        `Invalid manifest at ${filePath}: 'tolerance.allow_external_refs' must be a boolean`,
      );
    }
  }

  // exclusions (optional)
  if (obj.exclusions != null) {
    if (!Array.isArray(obj.exclusions)) {
      throw new Error(`Invalid manifest at ${filePath}: 'exclusions' must be an array`);
    }
    for (const entry of obj.exclusions) {
      validateExclusionEntry(entry, filePath);
    }
  }

  // fields validated above; final cast needed because TS can't track field-by-field validation
  return data as DocLintManifest;
}

function validateDocumentsBlock(
  documents: Record<string, unknown>,
  filePath: string,
  mode: string,
): void {
  // doc-first keeps the strict contract: required brd/frd/add. other modes only
  // require that any provided document refs are well-formed.
  const strict = mode === "doc-first";

  if (strict) {
    if (!Array.isArray(documents.required) || documents.required.length === 0) {
      throw new Error(`Invalid manifest at ${filePath}: 'documents.required' must be a non-empty array`);
    }
  } else if (documents.required != null && !Array.isArray(documents.required)) {
    throw new Error(`Invalid manifest at ${filePath}: 'documents.required' must be an array`);
  }

  for (const category of ["required", "optional", "contracts", "operational", "reference"] as const) {
    const value = documents[category];
    if (value == null) continue;
    if (!Array.isArray(value)) {
      throw new Error(`Invalid manifest at ${filePath}: 'documents.${category}' must be an array`);
    }
    for (const doc of value) {
      validateDocumentRef(doc, filePath);
    }
  }

  if (strict) {
    const requiredDocs = documents.required as DocumentRef[];
    const requiredRoles = requiredDocs.map((d) => d.role);
    for (const role of ["brd", "frd", "add"]) {
      if (!requiredRoles.includes(role)) {
        throw new Error(
          `Invalid manifest at ${filePath}: documents.required must include role '${role}'`,
        );
      }
    }
  }
}

function validateDocumentRef(doc: unknown, filePath: string): asserts doc is DocumentRef {
  if (!isRecord(doc)) {
    throw new Error(`Invalid manifest at ${filePath}: each document must be an object`);
  }
  if (typeof doc.role !== "string" || !doc.role) {
    throw new Error(`Invalid manifest at ${filePath}: each document must have a 'role'`);
  }
  if (typeof doc.path !== "string" || !doc.path) {
    throw new Error(`Invalid manifest at ${filePath}: each document must have a 'path'`);
  }
}

function validateExclusionEntry(entry: unknown, filePath: string): void {
  if (!isRecord(entry)) {
    throw new Error(`Invalid manifest at ${filePath}: each exclusion must be an object`);
  }

  const hasComponent = typeof entry.component === "string" && entry.component.length > 0;
  const hasConcernId = typeof entry.concernId === "string" && entry.concernId.length > 0;

  if (!hasComponent && !hasConcernId) {
    throw new Error(
      `Invalid manifest at ${filePath}: each exclusion must have at least one of 'component' or 'concernId'`,
    );
  }
  if (typeof entry.reason !== "string" || !entry.reason) {
    throw new Error(
      `Invalid manifest at ${filePath}: each exclusion must have a 'reason'`,
    );
  }
}
