import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import type { DocLintManifest, DocumentRef } from "../types/index.js";

const MANIFEST_FILENAMES = ["doc-lint.yaml", "doc-lint.yml"];

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

  // project
  if (!isRecord(obj.project)) {
    throw new Error(`Invalid manifest at ${filePath}: missing 'project'`);
  }
  if (typeof obj.project.name !== "string" || !obj.project.name) {
    throw new Error(`Invalid manifest at ${filePath}: missing 'project.name'`);
  }

  // documents
  if (!isRecord(obj.documents)) {
    throw new Error(`Invalid manifest at ${filePath}: missing 'documents'`);
  }
  if (!Array.isArray(obj.documents.required) || obj.documents.required.length === 0) {
    throw new Error(`Invalid manifest at ${filePath}: 'documents.required' must be a non-empty array`);
  }
  for (const doc of obj.documents.required) {
    validateDocumentRef(doc, filePath);
  }
  if (obj.documents.optional != null) {
    if (!Array.isArray(obj.documents.optional)) {
      throw new Error(`Invalid manifest at ${filePath}: 'documents.optional' must be an array`);
    }
    for (const doc of obj.documents.optional) {
      validateDocumentRef(doc, filePath);
    }
  }

  // validate required roles — safe to access .role after validateDocumentRef passed
  const requiredDocs = obj.documents.required as DocumentRef[];
  const requiredRoles = requiredDocs.map((d) => d.role);
  const neededRoles = ["brd", "frd", "add"];
  for (const role of neededRoles) {
    if (!requiredRoles.includes(role)) {
      throw new Error(
        `Invalid manifest at ${filePath}: documents.required must include role '${role}'`,
      );
    }
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

  // fields validated above; final cast needed because TS can't track field-by-field validation
  return data as DocLintManifest;
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
