import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { describe, it, expect } from "vitest";

import { loadManifest, findManifestPath } from "../../src/core/manifest.js";

const FIXTURES = path.join(import.meta.dirname, "../fixtures");

// helper: write a temp manifest yaml and load it
function loadFromYaml(yamlContent: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-test-"));
  const manifestPath = path.join(tmpDir, "doc-lint.yaml");
  fs.writeFileSync(manifestPath, yamlContent, "utf8");
  try {
    return loadManifest(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

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

  describe("v0.2 manifest fields", () => {
    it("loads manifest with classification field", () => {
      const manifest = loadManifest(FIXTURES, "expanded-manifest.yaml");
      expect(manifest.project.classification).toBe("financial");
    });

    it("accepts valid classification values", () => {
      for (const cls of ["standard", "financial", "healthcare", "infrastructure"]) {
        const manifest = loadFromYaml(`
version: "1.0"
project:
  name: "Test"
  classification: "${cls}"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
`);
        expect(manifest.project.classification).toBe(cls);
      }
    });

    it("rejects invalid classification values", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
  classification: "military"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
`),
      ).toThrow("classification");
    });

    it("loads manifest with contracts/operational/reference documents", () => {
      const manifest = loadManifest(FIXTURES, "expanded-manifest.yaml");
      expect(manifest.documents.contracts).toHaveLength(2);
      expect(manifest.documents.contracts![0]!.role).toBe("api_spec");
      expect(manifest.documents.operational).toHaveLength(1);
      expect(manifest.documents.operational![0]!.role).toBe("runbook");
      expect(manifest.documents.reference).toHaveLength(1);
      expect(manifest.documents.reference![0]!.role).toBe("security_standards");
    });

    it("rejects invalid documents.contracts entries", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
  contracts:
    - bad_entry: true
signals:
  declared: [test]
`),
      ).toThrow("document must have a 'role'");
    });

    it("validates tolerance fields", () => {
      const manifest = loadManifest(FIXTURES, "expanded-manifest.yaml");
      expect(manifest.tolerance).toBeDefined();
      expect(manifest.tolerance!.severity_threshold).toBe("warn");
      expect(manifest.tolerance!.allow_implicit).toBe(false);
      expect(manifest.tolerance!.allow_external_refs).toBe(true);
    });

    it("rejects invalid severity_threshold in tolerance", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
tolerance:
  severity_threshold: "critical"
`),
      ).toThrow("severity_threshold");
    });

    it("rejects non-boolean allow_implicit in tolerance", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
tolerance:
  allow_implicit: "yes"
`),
      ).toThrow("allow_implicit");
    });

    it("accepts manifest with auto_detect and warn_on_mismatch", () => {
      const manifest = loadManifest(FIXTURES, "expanded-manifest.yaml");
      expect(manifest.signals.auto_detect).toBe(true);
      expect(manifest.signals.warn_on_mismatch).toBe(true);
    });

    it("rejects non-boolean auto_detect", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
  auto_detect: "yes"
`),
      ).toThrow("auto_detect");
    });

    it("validates exclusions array with valid entries", () => {
      const manifest = loadManifest(FIXTURES, "expanded-manifest.yaml");
      expect(manifest.exclusions).toHaveLength(2);
      expect(manifest.exclusions![0]!.component).toBe("legacy-auth-module");
      expect(manifest.exclusions![0]!.reason).toBe("Scheduled for deprecation in Q3");
      expect(manifest.exclusions![0]!.approved_by).toBe("tech-lead");
      expect(manifest.exclusions![1]!.approved_by).toBeUndefined();
    });

    it("accepts exclusion with only concernId", () => {
      const manifest = loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
exclusions:
  - concernId: "threat-model-coverage"
    reason: "Not applicable to internal tools"
`);
      expect(manifest.exclusions).toHaveLength(1);
      expect(manifest.exclusions![0]!.concernId).toBe("threat-model-coverage");
      expect(manifest.exclusions![0]!.component).toBeUndefined();
    });

    it("accepts exclusion with both component and concernId", () => {
      const manifest = loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
exclusions:
  - component: "legacy-auth"
    concernId: "auth-boundary-consistency"
    reason: "Being replaced"
`);
      expect(manifest.exclusions).toHaveLength(1);
      expect(manifest.exclusions![0]!.component).toBe("legacy-auth");
      expect(manifest.exclusions![0]!.concernId).toBe("auth-boundary-consistency");
    });

    it("rejects exclusion with neither component nor concernId", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
exclusions:
  - reason: "no component or concernId"
`),
      ).toThrow("at least one of 'component' or 'concernId'");
    });

    it("rejects exclusion entries missing reason", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
exclusions:
  - component: "something"
`),
      ).toThrow("reason");
    });

    it("rejects exclusions that is not an array", () => {
      expect(() =>
        loadFromYaml(`
version: "1.0"
project:
  name: "Test"
documents:
  required:
    - role: brd
      path: x.md
    - role: frd
      path: x.md
    - role: add
      path: x.md
signals:
  declared: [test]
exclusions: "not-an-array"
`),
      ).toThrow("exclusions");
    });
  });
});
