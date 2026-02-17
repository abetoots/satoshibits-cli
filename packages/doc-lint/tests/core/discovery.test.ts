import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { discoverDocuments, getMissingRequiredRoles, ROLE_PATTERNS } from "../../src/core/discovery.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-discovery-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content = "# Document\nSample content"): void {
  const abs = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

describe("discoverDocuments", () => {
  it("finds standard brd/frd/add files", async () => {
    writeFile("docs/brd.md");
    writeFile("docs/frd.md");
    writeFile("docs/add.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]).toContain("docs/brd.md");
    expect(result.candidates["frd"]).toContain("docs/frd.md");
    expect(result.candidates["add"]).toContain("docs/add.md");
    expect(result.missingRoles).not.toContain("brd");
    expect(result.missingRoles).not.toContain("frd");
    expect(result.missingRoles).not.toContain("add");
  });

  it("finds alternative filename patterns", async () => {
    writeFile("docs/business-requirements.md");
    writeFile("docs/functional-spec.md");
    writeFile("docs/architecture.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]).toBeDefined();
    expect(result.candidates["brd"]!.length).toBeGreaterThan(0);
    expect(result.candidates["frd"]).toBeDefined();
    expect(result.candidates["frd"]!.length).toBeGreaterThan(0);
    expect(result.candidates["add"]).toBeDefined();
    expect(result.candidates["add"]!.length).toBeGreaterThan(0);
  });

  it("reports missing roles", async () => {
    writeFile("docs/brd.md");
    // no frd or add

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]).toBeDefined();
    expect(result.missingRoles).toContain("frd");
    expect(result.missingRoles).toContain("add");
  });

  it("ignores node_modules", async () => {
    writeFile("node_modules/docs/brd.md");
    writeFile("docs/brd.md");

    const result = await discoverDocuments(tmpDir);

    const brdPaths = result.candidates["brd"] ?? [];
    expect(brdPaths).toContain("docs/brd.md");
    expect(brdPaths.every((p) => !p.includes("node_modules"))).toBe(true);
  });

  it("ignores .git directory", async () => {
    writeFile(".git/docs/architecture.md");
    writeFile("docs/architecture.md");

    const result = await discoverDocuments(tmpDir);

    const addPaths = result.candidates["add"] ?? [];
    expect(addPaths.every((p) => !p.includes(".git"))).toBe(true);
  });

  it("finds multiple candidates for the same role", async () => {
    writeFile("docs/brd.md");
    writeFile("docs/requirements.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]!.length).toBeGreaterThanOrEqual(2);
  });

  it("discovers optional roles (api_spec, runbook)", async () => {
    writeFile("docs/openapi.yaml", "openapi: 3.0.0\ninfo:\n  title: Test");
    writeFile("docs/runbook.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["api_spec"]).toBeDefined();
    expect(result.candidates["runbook"]).toBeDefined();
  });

  it("finds suffixed brd/frd/add filenames", async () => {
    writeFile("01-strategy/platform-core-brd.md");
    writeFile("02-requirements/platform-core-frd.md");
    writeFile("03-architecture/platform-core-add.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]).toBeDefined();
    expect(result.candidates["brd"]!.some((p) => p.includes("platform-core-brd.md"))).toBe(true);
    expect(result.candidates["frd"]).toBeDefined();
    expect(result.candidates["frd"]!.some((p) => p.includes("platform-core-frd.md"))).toBe(true);
    expect(result.candidates["add"]).toBeDefined();
    expect(result.candidates["add"]!.some((p) => p.includes("platform-core-add.md"))).toBe(true);
  });

  it("finds underscore-suffixed brd/frd/add filenames", async () => {
    writeFile("docs/my_project_brd.md");
    writeFile("docs/my_project_frd.md");
    writeFile("docs/my_project_add.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]).toBeDefined();
    expect(result.candidates["brd"]!.some((p) => p.includes("my_project_brd.md"))).toBe(true);
    expect(result.candidates["frd"]).toBeDefined();
    expect(result.candidates["frd"]!.some((p) => p.includes("my_project_frd.md"))).toBe(true);
    expect(result.candidates["add"]).toBeDefined();
    expect(result.candidates["add"]!.some((p) => p.includes("my_project_add.md"))).toBe(true);
  });

  it("finds infixed brd/frd/add filenames", async () => {
    writeFile("docs/platform-brd-v2.md");
    writeFile("docs/platform-frd-v2.md");
    writeFile("docs/platform-add-v2.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["brd"]).toBeDefined();
    expect(result.candidates["brd"]!.some((p) => p.includes("platform-brd-v2.md"))).toBe(true);
    expect(result.candidates["frd"]).toBeDefined();
    expect(result.candidates["frd"]!.some((p) => p.includes("platform-frd-v2.md"))).toBe(true);
    expect(result.candidates["add"]).toBeDefined();
    expect(result.candidates["add"]!.some((p) => p.includes("platform-add-v2.md"))).toBe(true);
  });

  it("finds prefixed runbook filenames", async () => {
    writeFile("06-operations/01-runbook.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["runbook"]).toBeDefined();
    expect(result.candidates["runbook"]!.some((p) => p.includes("01-runbook.md"))).toBe(true);
  });

  it("finds underscore-prefixed runbook filenames", async () => {
    writeFile("ops/team_runbook.md");

    const result = await discoverDocuments(tmpDir);

    expect(result.candidates["runbook"]).toBeDefined();
    expect(result.candidates["runbook"]!.some((p) => p.includes("team_runbook.md"))).toBe(true);
  });

  it("skips binary files", async () => {
    // create a file with binary extension
    const binPath = path.join(tmpDir, "docs", "architecture.png");
    fs.mkdirSync(path.dirname(binPath), { recursive: true });
    fs.writeFileSync(binPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    writeFile("docs/architecture.md");

    const result = await discoverDocuments(tmpDir);

    const addPaths = result.candidates["add"] ?? [];
    expect(addPaths.every((p) => !p.endsWith(".png"))).toBe(true);
  });

  it("skips files over 1MB", async () => {
    // create a >1MB file
    const bigContent = "x".repeat(1024 * 1024 + 1);
    writeFile("docs/brd.md", bigContent);
    writeFile("docs/requirements.md", "# Small file");

    const result = await discoverDocuments(tmpDir);

    const brdPaths = result.candidates["brd"] ?? [];
    // the large brd.md should be skipped, but requirements.md still matches
    expect(brdPaths).not.toContain("docs/brd.md");
    expect(brdPaths).toContain("docs/requirements.md");
  });

  it("returns empty when no documents found", async () => {
    // empty project
    const result = await discoverDocuments(tmpDir);

    expect(Object.keys(result.candidates)).toHaveLength(0);
    expect(result.missingRoles.length).toBeGreaterThan(0);
  });

  it("respects custom ignore patterns", async () => {
    writeFile("archived/docs/brd.md");
    writeFile("docs/brd.md");

    const result = await discoverDocuments(tmpDir, ["**/archived/**"]);

    const brdPaths = result.candidates["brd"] ?? [];
    expect(brdPaths).toContain("docs/brd.md");
    expect(brdPaths.every((p) => !p.includes("archived"))).toBe(true);
  });

  it("supports multiple custom ignore patterns", async () => {
    writeFile("archived/docs/brd.md");
    writeFile("deprecated/docs/frd.md");
    writeFile("docs/brd.md");
    writeFile("docs/frd.md");
    writeFile("docs/add.md");

    const result = await discoverDocuments(tmpDir, [
      "**/archived/**",
      "**/deprecated/**",
    ]);

    const brdPaths = result.candidates["brd"] ?? [];
    const frdPaths = result.candidates["frd"] ?? [];
    expect(brdPaths.every((p) => !p.includes("archived"))).toBe(true);
    expect(frdPaths.every((p) => !p.includes("deprecated"))).toBe(true);
  });

  it("merges custom ignore patterns with built-in ignores", async () => {
    writeFile("node_modules/docs/brd.md");
    writeFile("archived/docs/brd.md");
    writeFile("docs/brd.md");

    const result = await discoverDocuments(tmpDir, ["**/archived/**"]);

    const brdPaths = result.candidates["brd"] ?? [];
    expect(brdPaths).toContain("docs/brd.md");
    expect(brdPaths.every((p) => !p.includes("node_modules"))).toBe(true);
    expect(brdPaths.every((p) => !p.includes("archived"))).toBe(true);
  });
});

describe("getMissingRequiredRoles", () => {
  it("returns missing required roles (brd, frd, add)", async () => {
    writeFile("docs/brd.md");

    const discovery = await discoverDocuments(tmpDir);
    const missing = getMissingRequiredRoles(discovery);

    expect(missing).toContain("frd");
    expect(missing).toContain("add");
    expect(missing).not.toContain("brd");
  });

  it("returns empty when all required roles found", async () => {
    writeFile("docs/brd.md");
    writeFile("docs/frd.md");
    writeFile("docs/add.md");

    const discovery = await discoverDocuments(tmpDir);
    const missing = getMissingRequiredRoles(discovery);

    expect(missing).toHaveLength(0);
  });
});

describe("ROLE_PATTERNS", () => {
  it("has patterns for all required roles", () => {
    expect(ROLE_PATTERNS["brd"]).toBeDefined();
    expect(ROLE_PATTERNS["frd"]).toBeDefined();
    expect(ROLE_PATTERNS["add"]).toBeDefined();
  });

  it("has patterns for optional roles", () => {
    expect(ROLE_PATTERNS["api_spec"]).toBeDefined();
    expect(ROLE_PATTERNS["runbook"]).toBeDefined();
    expect(ROLE_PATTERNS["security_standards"]).toBeDefined();
  });
});
