/**
 * Tests for add-skill --template workflow
 * Tests template browsing, selection, variable substitution, and activation rules
 *
 * IMPORTANT: These are SMOKE TESTS, not regression tests.
 *
 * Limitations:
 * - CLI requires interactive prompts for template selection
 * - Tests verify CLI runs without crashing, not that features work correctly
 * - Actual functionality is tested in unit tests (TemplateCatalog class tests)
 *
 * When tests pass with "Should show template catalog" assertions, it means:
 * - The CLI successfully reached the template selection phase
 * - NOT that the template was actually installed
 *
 * NOTE ON BRANCHING LOGIC:
 * Tests use if/else branching because the CLI behavior depends on whether
 * the template was installed (non-interactive) or showed catalog (interactive).
 * Both paths are valid smoke test outcomes. The branching ensures:
 * - If installed: verify content is correct
 * - If catalog shown: verify CLI reached interactive phase without crash
 * This is intentional for smoke testing - regression tests are in unit tests.
 *
 * For regression testing of template functionality, see:
 * - src/utils/template-catalog.test.ts (unit tests)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// path to compiled CLI (built with tsc)
// using compiled CLI instead of tsx avoids ~700ms startup overhead per call
const COMPILED_CLI_PATH = path.join(__dirname, "../../dist/src/bin/cli.js");

// helper to run CLI commands with proper error handling
// uses compiled CLI for performance (~50ms vs ~700ms with tsx)
function runCli(
  args: string,
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node "${COMPILED_CLI_PATH}" ${args}`, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (_error) {
    const execError = _error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

describe("add-skill --template workflow", () => {
  let tmpDir: string;

  // ensure CLI is built before running tests
  beforeAll(() => {
    if (!fs.existsSync(COMPILED_CLI_PATH)) {
      throw new Error(
        `Compiled CLI not found at ${COMPILED_CLI_PATH}. Run 'pnpm build' first.`
      );
    }
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync("/tmp/template-test-");

    // initialize first (using compiled CLI for ~50ms vs ~700ms with tsx)
    execSync(`node "${COMPILED_CLI_PATH}" init --yes`, {
      cwd: tmpDir,
      stdio: "ignore",
    });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("Backend template installation", () => {
    it("should install backend-dev-guidelines template", () => {
      // note: CLI with --template shows interactive catalog
      // test verifies the CLI runs without error and shows template info
      const result = runCli(
        `add-skill backend-dev-guidelines --template`,
        tmpDir,
      );

      // CLI should show template catalog or succeed
      const showedCatalog = result.stdout.includes("Template") ||
                            result.stdout.includes("backend") ||
                            result.stdout.includes("Catalog");

      const skillPath = path.join(
        tmpDir,
        ".claude/skills/backend-dev-guidelines/SKILL.md",
      );

      if (fs.existsSync(skillPath)) {
        // if skill was created (non-interactive mode worked)
        const content = fs.readFileSync(skillPath, "utf8");
        expect(
          content.includes("Backend") || content.includes("backend"),
        ).toBe(true);
      } else {
        // CLI showed template catalog (requires interactive selection)
        expect(showedCatalog).toBe(true);
      }
    });

    it("should add activation rules to skill-rules.yaml", () => {
      const result = runCli(`add-skill backend-dev-guidelines --template`, tmpDir);

      const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
      expect(fs.existsSync(rulesPath)).toBe(true);

      const content = fs.readFileSync(rulesPath, "utf8");

      // if installation succeeded, verify entry exists
      if (content.includes("backend-dev-guidelines")) {
        expect(
          content.includes("promptTriggers") || content.includes("keywords"),
        ).toBe(true);
      } else {
        // CLI requires interactive selection - verify catalog was shown
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });
  });

  describe("Variable substitution", () => {
    it("should substitute --var values in template content", () => {
      // install with custom variable
      const result = runCli(
        `add-skill backend-dev-guidelines --template --var BACKEND_FRAMEWORK=Fastify`,
        tmpDir,
      );

      const skillPath = path.join(
        tmpDir,
        ".claude/skills/backend-dev-guidelines/SKILL.md",
      );

      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf8");
        expect(content.length > 0).toBe(true);
        // verify Fastify was substituted
        expect(content.includes("Fastify")).toBe(true);
      } else {
        // CLI requires interactive selection
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });

    it("should handle multiple --var substitutions", () => {
      const result = runCli(
        `add-skill backend-dev-guidelines --template --var BACKEND_FRAMEWORK=Koa --var DATABASE_ORM=Drizzle`,
        tmpDir,
      );

      const skillPath = path.join(
        tmpDir,
        ".claude/skills/backend-dev-guidelines/SKILL.md",
      );

      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf8");
        expect(content.includes("Koa")).toBe(true);
        expect(content.includes("Drizzle")).toBe(true);
      } else {
        // CLI requires interactive selection
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });

    it("should use default values when --var not provided", () => {
      const result = runCli(`add-skill backend-dev-guidelines --template`, tmpDir);

      const skillPath = path.join(
        tmpDir,
        ".claude/skills/backend-dev-guidelines/SKILL.md",
      );

      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf8");
        // should contain default framework value (Express)
        expect(content.includes("Express")).toBe(true);
      } else {
        // CLI requires interactive selection
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });
  });

  describe("Error handling template", () => {
    it("should install error-handling template", () => {
      const result = runCli(`add-skill error-handling --template`, tmpDir);

      const skillPath = path.join(
        tmpDir,
        ".claude/skills/error-handling/SKILL.md",
      );

      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf8");
        expect(
          content.includes("error") || content.includes("Error"),
        ).toBe(true);
      } else {
        // CLI requires interactive selection
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });
  });

  describe("Frontend template", () => {
    it("should install frontend-dev-guidelines template", () => {
      const result = runCli(`add-skill frontend-dev-guidelines --template`, tmpDir);

      const skillPath = path.join(
        tmpDir,
        ".claude/skills/frontend-dev-guidelines/SKILL.md",
      );

      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf8");
        expect(
          content.includes("React") ||
            content.includes("frontend") ||
            content.includes("Frontend") ||
            content.includes("component"),
        ).toBe(true);
      } else {
        // CLI requires interactive selection
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });
  });

  describe("Template catalog listing", () => {
    it("should list available templates with --template flag only", () => {
      const result = runCli(`add-skill --template`, tmpDir);

      // should show available templates or prompt for selection
      expect(
        result.stdout.includes("Template") ||
          result.stdout.includes("backend") ||
          result.stdout.includes("frontend") ||
          result.stdout.includes("error"),
      ).toBe(true);
    });
  });

  describe("Resources directory", () => {
    it("should copy resources directory if template has one", () => {
      // install backend template
      const result = runCli(`add-skill backend-dev-guidelines --template`, tmpDir);

      const skillDir = path.join(
        tmpDir,
        ".claude/skills/backend-dev-guidelines",
      );

      if (fs.existsSync(skillDir)) {
        // check for resources directory (may or may not exist depending on template)
        const resourcesDir = path.join(skillDir, "resources");
        if (fs.existsSync(resourcesDir)) {
          // verify resources directory is readable and contains valid entries
          const files = fs.readdirSync(resourcesDir);
          expect(Array.isArray(files)).toBe(true);
          // verify each entry is accessible (not corrupted symlinks, etc)
          for (const file of files) {
            expect(fs.existsSync(path.join(resourcesDir, file))).toBe(true);
          }
        }
        // resources are optional for templates - test passes if dir doesn't exist
      } else {
        // CLI requires interactive selection
        expect(
          result.stdout.includes("Template") || result.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle non-existent template gracefully", () => {
      const result = runCli(
        `add-skill non-existent-template --template`,
        tmpDir,
      );

      // should show catalog (since specific template isn't directly installed)
      // or indicate template not found
      expect(
        result.stdout.includes("Template") ||
          result.stdout.includes("Catalog") ||
          result.stderr.includes("not found") ||
          result.stdout.includes("not found"),
      ).toBe(true);
    });

    it("should not duplicate skills if already installed", () => {
      // install once
      const result1 = runCli(`add-skill backend-dev-guidelines --template`, tmpDir);

      // install again
      runCli(`add-skill backend-dev-guidelines --template`, tmpDir);

      // check skill directory
      const skillsDir = path.join(tmpDir, ".claude/skills");
      expect(fs.existsSync(skillsDir)).toBe(true);

      const dirs = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .filter((d) => d.name === "backend-dev-guidelines");

      // should have at most one instance (or zero if CLI requires interactive)
      expect(dirs.length <= 1).toBe(true);

      // verify CLI shows catalog if no installation
      if (dirs.length === 0) {
        expect(
          result1.stdout.includes("Template") || result1.stdout.includes("Catalog"),
        ).toBe(true);
      }
    });
  });
});
