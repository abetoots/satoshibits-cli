import * as path from "node:path";
import { describe, it, expect } from "vitest";

import { loadDocuments } from "../../src/core/documents.js";

import type { DocLintManifest } from "../../src/types/index.js";

const FIXTURES = path.join(import.meta.dirname, "../fixtures");

function makeManifest(overrides: Partial<DocLintManifest> = {}): DocLintManifest {
  return {
    version: "1.0",
    project: { name: "Test" },
    documents: {
      required: [
        { role: "brd", path: "sample-brd.md", label: "BRD" },
      ],
    },
    signals: { declared: ["test-signal"] },
    ...overrides,
  };
}

describe("documents", () => {
  it("loads required documents", () => {
    const manifest = makeManifest();
    const docs = loadDocuments(manifest, FIXTURES);

    expect(docs.all).toHaveLength(1);
    expect(docs.byRole.brd).toBeDefined();
    expect(docs.byRole.brd!.content).toContain("Business Requirements");
  });

  it("throws for missing required documents", () => {
    const manifest = makeManifest({
      documents: {
        required: [{ role: "brd", path: "nonexistent.md" }],
      },
    });

    expect(() => loadDocuments(manifest, FIXTURES)).toThrow(
      "Required document not found",
    );
  });

  it("skips missing optional documents", () => {
    const manifest = makeManifest({
      documents: {
        required: [{ role: "brd", path: "sample-brd.md" }],
        optional: [{ role: "api-spec", path: "nonexistent.yaml" }],
      },
    });

    const docs = loadDocuments(manifest, FIXTURES);
    expect(docs.all).toHaveLength(1);
    expect(docs.byRole["api-spec"]).toBeUndefined();
  });

  it("uses label from ref or defaults to uppercase role", () => {
    const manifest = makeManifest({
      documents: {
        required: [
          { role: "brd", path: "sample-brd.md", label: "My BRD" },
        ],
      },
    });

    const docs = loadDocuments(manifest, FIXTURES);
    expect(docs.byRole.brd!.label).toBe("My BRD");
  });
});
