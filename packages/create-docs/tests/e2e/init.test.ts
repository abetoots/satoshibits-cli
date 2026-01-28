/**
 * E2E tests for create-docs CLI commands
 * Tests generated file contents to catch integration/configuration bugs
 * such as wrong package names, incorrect template variables, and broken cross-references.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CreateDocsConfig {
  profile: string;
  projectName: string;
  variance: string;
}

// path to compiled CLI (from tests/e2e/ -> package root -> dist/src/)
const COMPILED_CLI_PATH = path.join(__dirname, "../../dist/src/index.js");

describe("create-docs E2E", () => {
  // ensure CLI is built before running tests
  beforeAll(() => {
    if (!fs.existsSync(COMPILED_CLI_PATH)) {
      throw new Error(
        `Compiled CLI not found at ${COMPILED_CLI_PATH}. Run 'pnpm build' first.`
      );
    }
  });

  describe("greenfield profile", () => {
    let tmpDir: string;

    // single CLI invocation for all greenfield tests
    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-docs-e2e-greenfield-");
      execSync(`node "${COMPILED_CLI_PATH}" init --profile greenfield --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates correct directory structure", () => {
      const expectedDirs = [
        "docs",
        "docs/00-meta",
        "docs/01-strategy",
        "docs/02-requirements",
        "docs/03-architecture",
        "docs/03-architecture/decisions",
        "docs/04-specs",
        "docs/05-guidelines",
        "docs/06-operations",
        "docs/archive",
      ];

      for (const dir of expectedDirs) {
        expect(fs.existsSync(path.join(tmpDir, dir))).toBe(true);
      }
    });

    it("creates config file with correct profile", () => {
      const configPath = path.join(tmpDir, ".create-docs.json");
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as CreateDocsConfig;
      expect(config.profile).toBe("greenfield");
    });

    it("creates core documents for greenfield profile", () => {
      const expectedDocs = [
        "docs/README.md",
        "docs/00-meta/glossary.md",
        "docs/01-strategy/brd.md",
        "docs/02-requirements/frd.md",
        "docs/03-architecture/add.md",
        "docs/04-specs/index.md",
      ];

      for (const doc of expectedDocs) {
        expect(fs.existsSync(path.join(tmpDir, doc))).toBe(true);
      }
    });

    it("generates documents without unreplaced template placeholders", () => {
      const docsToCheck = [
        "docs/README.md",
        "docs/00-meta/glossary.md",
        "docs/01-strategy/brd.md",
        "docs/02-requirements/frd.md",
        "docs/03-architecture/add.md",
      ];

      for (const doc of docsToCheck) {
        const docPath = path.join(tmpDir, doc);
        if (fs.existsSync(docPath)) {
          const content = fs.readFileSync(docPath, "utf8");
          expect(content).not.toMatch(/\{\{[^}]+\}\}/);
        }
      }
    });

    it("generates documents with valid frontmatter", () => {
      const docsWithFrontmatter = [
        "docs/00-meta/glossary.md",
        "docs/01-strategy/brd.md",
        "docs/02-requirements/frd.md",
        "docs/03-architecture/add.md",
      ];

      for (const doc of docsWithFrontmatter) {
        const docPath = path.join(tmpDir, doc);
        if (fs.existsSync(docPath)) {
          const content = fs.readFileSync(docPath, "utf8");
          expect(content.startsWith("---")).toBe(true);
          expect(content.indexOf("---", 3)).toBeGreaterThan(3);
        }
      }
    });

    it("config file contains all required fields", () => {
      const configPath = path.join(tmpDir, ".create-docs.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as CreateDocsConfig;

      expect(config.profile).toBeDefined();
      expect(config.projectName).toBeDefined();
      expect(config.variance).toBeDefined();
    });

    it("config file is valid JSON", () => {
      const configPath = path.join(tmpDir, ".create-docs.json");
      const content = fs.readFileSync(configPath, "utf8");
      expect(() => JSON.parse(content) as CreateDocsConfig).not.toThrow();
    });
  });

  describe("migration profile", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-docs-e2e-migration-");
      execSync(`node "${COMPILED_CLI_PATH}" init --profile migration --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates config with migration profile", () => {
      const configPath = path.join(tmpDir, ".create-docs.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as CreateDocsConfig;
      expect(config.profile).toBe("migration");
    });

    it("migration profile does not include brd.md", () => {
      const brdPath = path.join(tmpDir, "docs/01-strategy/brd.md");
      expect(fs.existsSync(brdPath)).toBe(false);
    });
  });

  describe("library profile", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-docs-e2e-library-");
      execSync(`node "${COMPILED_CLI_PATH}" init --profile library --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates config with library profile", () => {
      const configPath = path.join(tmpDir, ".create-docs.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as CreateDocsConfig;
      expect(config.profile).toBe("library");
    });

    it("library profile excludes brd and frd", () => {
      expect(fs.existsSync(path.join(tmpDir, "docs/01-strategy/brd.md"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, "docs/02-requirements/frd.md"))).toBe(false);
    });
  });

  describe("new command", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-docs-e2e-new-");
      // initialize first
      execSync(`node "${COMPILED_CLI_PATH}" init --profile greenfield --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
      // create all document types
      execSync(`node "${COMPILED_CLI_PATH}" new adr "Use PostgreSQL for data"`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
      execSync(`node "${COMPILED_CLI_PATH}" new spec caching`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
      execSync(`node "${COMPILED_CLI_PATH}" new guideline code-review`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates ADR with auto-numbered filename", () => {
      const decisionsDir = path.join(tmpDir, "docs/03-architecture/decisions");
      const files = fs.readdirSync(decisionsDir);

      const adrFiles = files.filter((f) => /^\d{4}-.*\.md$/.test(f));
      expect(adrFiles.length).toBeGreaterThan(0);

      const firstAdr = adrFiles[0];
      expect(firstAdr).toBeDefined();
      const adrPath = path.join(decisionsDir, firstAdr!);
      const content = fs.readFileSync(adrPath, "utf8");

      expect(content.startsWith("---")).toBe(true);
      expect(content.toLowerCase()).toContain("postgresql");
    });

    it("creates spec document in correct directory", () => {
      const specPath = path.join(tmpDir, "docs/04-specs/caching.md");
      expect(fs.existsSync(specPath)).toBe(true);

      const content = fs.readFileSync(specPath, "utf8");
      expect(content.startsWith("---")).toBe(true);
    });

    it("creates guideline document in correct directory", () => {
      const guidelinePath = path.join(tmpDir, "docs/05-guidelines/code-review.md");
      expect(fs.existsSync(guidelinePath)).toBe(true);

      const content = fs.readFileSync(guidelinePath, "utf8");
      expect(content.startsWith("---")).toBe(true);
    });
  });

  describe("lint and status commands", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-docs-e2e-commands-");
      execSync(`node "${COMPILED_CLI_PATH}" init --profile greenfield --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("lint runs without crashing on valid docs", () => {
      const result = execSync(`node "${COMPILED_CLI_PATH}" lint`, {
        cwd: tmpDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(result).toBeDefined();
    });

    it("status runs without crashing", () => {
      const result = execSync(`node "${COMPILED_CLI_PATH}" status`, {
        cwd: tmpDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(result).toBeDefined();
    });
  });

  describe("idempotency", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-docs-e2e-idempotency-");
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("running init twice preserves existing documents", () => {
      // first init
      execSync(`node "${COMPILED_CLI_PATH}" init --profile greenfield --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });

      // modify a document
      const readmePath = path.join(tmpDir, "docs/README.md");
      const originalContent = fs.readFileSync(readmePath, "utf8");
      const modifiedContent = originalContent + "\n<!-- Custom modification -->";
      fs.writeFileSync(readmePath, modifiedContent);

      // second init (without --force)
      execSync(`node "${COMPILED_CLI_PATH}" init --profile greenfield --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });

      // verify modification is preserved
      const afterContent = fs.readFileSync(readmePath, "utf8");
      expect(afterContent).toContain("<!-- Custom modification -->");
    });
  });
});
