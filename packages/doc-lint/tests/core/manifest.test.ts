import * as path from "node:path";
import { describe, it, expect } from "vitest";

import { loadManifest, findManifestPath } from "../../src/core/manifest.js";

const FIXTURES = path.join(import.meta.dirname, "../fixtures");

describe("manifest", () => {
  describe("findManifestPath", () => {
    it("finds doc-lint.yaml in project directory", () => {
      // create a temp-like structure using fixtures
      const result = findManifestPath(FIXTURES, "valid-manifest.yaml");
      expect(result).toContain("valid-manifest.yaml");
    });

    it("throws when no manifest found", () => {
      expect(() => findManifestPath("/nonexistent/path")).toThrow(
        "No doc-lint manifest found",
      );
    });

    it("throws when specified config not found", () => {
      expect(() => findManifestPath(FIXTURES, "nonexistent.yaml")).toThrow(
        "Config file not found",
      );
    });
  });

  describe("loadManifest", () => {
    it("loads and validates a valid manifest", () => {
      const manifest = loadManifest(FIXTURES, "valid-manifest.yaml");
      expect(manifest.version).toBe("1.0");
      expect(manifest.project.name).toBe("Test Project");
      expect(manifest.documents.required).toHaveLength(3);
      expect(manifest.signals.declared).toContain("external-api");
    });

    it("rejects manifest with empty required documents", () => {
      expect(() => loadManifest(FIXTURES, "invalid-manifest.yaml")).toThrow(
        "must be a non-empty array",
      );
    });

    it("validates required roles (brd, frd, add)", () => {
      const manifest = loadManifest(FIXTURES, "valid-manifest.yaml");
      const roles = manifest.documents.required.map((d) => d.role);
      expect(roles).toContain("brd");
      expect(roles).toContain("frd");
      expect(roles).toContain("add");
    });
  });
});
