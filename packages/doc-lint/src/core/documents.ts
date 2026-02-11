import * as fs from "node:fs";
import * as path from "node:path";

import type { DocLintManifest, DocumentRef } from "../types/index.js";

export interface LoadedDocument {
  role: string;
  label: string;
  path: string;
  content: string;
}

export interface LoadedDocuments {
  all: LoadedDocument[];
  byRole: Record<string, LoadedDocument>;
}

export function loadDocuments(manifest: DocLintManifest, projectPath: string): LoadedDocuments {
  const all: LoadedDocument[] = [];
  const byRole: Record<string, LoadedDocument> = {};

  // load required documents
  for (const ref of manifest.documents.required) {
    const doc = loadSingleDocument(ref, projectPath, true);
    all.push(doc);
    byRole[doc.role] = doc;
  }

  // load optional documents
  if (manifest.documents.optional) {
    for (const ref of manifest.documents.optional) {
      const doc = loadSingleDocument(ref, projectPath, false);
      if (doc) {
        all.push(doc);
        byRole[doc.role] = doc;
      }
    }
  }

  return { all, byRole };
}

function loadSingleDocument(
  ref: DocumentRef,
  projectPath: string,
  required: true,
): LoadedDocument;
function loadSingleDocument(
  ref: DocumentRef,
  projectPath: string,
  required: false,
): LoadedDocument | null;
function loadSingleDocument(
  ref: DocumentRef,
  projectPath: string,
  required: boolean,
): LoadedDocument | null {
  const fullPath = path.resolve(projectPath, ref.path);

  if (!fs.existsSync(fullPath)) {
    if (required) {
      throw new Error(`Required document not found: ${ref.path} (role: ${ref.role})`);
    }
    return null;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const label = ref.label ?? ref.role.toUpperCase();

  return {
    role: ref.role,
    label,
    path: ref.path,
    content,
  };
}
