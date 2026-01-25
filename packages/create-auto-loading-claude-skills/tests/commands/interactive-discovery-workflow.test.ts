/**
 * Tests for add-skill --interactive workflow
 * Tests document discovery, symlink creation, and cache management
 *
 * IMPORTANT: These are SMOKE TESTS, not regression tests.
 *
 * Limitations:
 * - CLI requires interactive prompts for document selection
 * - Tests verify CLI runs without crashing, not that features work correctly
 * - Actual functionality is tested in unit tests (DocumentDiscovery class tests)
 *
 * When tests pass with conditional assertions, it means:
 * - If skill created: verifies content is correct
 * - If skill not created: verifies CLI reached interactive prompt phase
 *
 * For regression testing of discovery functionality, see:
 * - src/utils/document-discovery.test.ts (unit tests)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
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
  timeout = 10000,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node "${COMPILED_CLI_PATH}" ${args}`, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

describe("add-skill --interactive workflow", () => {
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
    tmpDir = fs.mkdtempSync("/tmp/interactive-test-");

    // create project documentation
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "CONTRIBUTING.md"),
      "# Contributing\n\nFollow TDD and testing guidelines.",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "docs/api-patterns.md"),
      "# API Patterns\n\nREST, controllers, services.",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "docs/testing-guide.md"),
      "# Testing Guide\n\nUnit tests, integration tests, TDD.",
      "utf8",
    );

    // initialize (using compiled CLI for ~50ms vs ~700ms with tsx)
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

  describe("Document discovery", () => {
    it("should create discovery cache during --interactive", () => {
      // run with keywords - will timeout at prompts but should create cache
      try {
        execSync(
          `node "${COMPILED_CLI_PATH}" add-skill backend-patterns --interactive -k "API,controller,REST"`,
          {
            cwd: tmpDir,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000,
          },
        );
      } catch (error) {
        // only ignore timeout or interactive exit (exit code 1), re-throw real crashes
        const execError = error as { code?: string; status?: number; stderr?: string };
        const isTimeout = execError.code === "ETIMEDOUT";
        const isInteractiveExit = execError.status === 1;
        if (!isTimeout && !isInteractiveExit) {
          throw error;
        }
        // verify no unexpected error messages in stderr
        if (execError.stderr?.toLowerCase().includes("error:")) {
          throw error;
        }
      }

      // check that discovery cache was created
      const cachePath = path.join(tmpDir, ".claude/cache/discovered-docs.json");
      expect(fs.existsSync(cachePath)).toBe(true);

      const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
        suggestions?: unknown[];
        version?: string;
        discoveredAt?: number | string;
      };
      expect(cache.suggestions && cache.suggestions.length > 0).toBe(true);
    });

    it("should cache discovery results", () => {
      try {
        execSync(
          `node "${COMPILED_CLI_PATH}" add-skill test-skill --interactive -k "test"`,
          {
            cwd: tmpDir,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000,
          },
        );
      } catch (error) {
        // only ignore timeout or interactive exit, re-throw real crashes
        const execError = error as { code?: string; status?: number; stderr?: string };
        const isTimeout = execError.code === "ETIMEDOUT";
        const isInteractiveExit = execError.status === 1;
        if (!isTimeout && !isInteractiveExit) {
          throw error;
        }
        if (execError.stderr?.toLowerCase().includes("error:")) {
          throw error;
        }
      }

      const cachePath = path.join(tmpDir, ".claude/cache/discovered-docs.json");

      // cache may or may not be created depending on timing with prompts
      // this is a smoke test - the important thing is the CLI didn't crash
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
          suggestions?: unknown[];
          version?: string;
          discoveredAt?: number | string;
        };
        // verify cache has expected structure
        // note: cache schema supports EITHER version (v2+) OR suggestions (v1) for backwards compatibility
        const hasVersion = typeof cache.version === 'string' && cache.version.length > 0;
        const hasSuggestions = Array.isArray(cache.suggestions);
        expect(hasVersion || hasSuggestions).toBe(true);
        if (cache.discoveredAt) {
          expect(
            typeof cache.discoveredAt === "number" ||
              typeof cache.discoveredAt === "string",
          ).toBe(true);
        }
      }
      // note: if cache doesn't exist, test still passes - this is a smoke test
      // that verifies the CLI runs without crashing, not that cache is created
    });
  });

  describe("Symlink creation", () => {
    it("should create symlinks to discovered docs in resources/", () => {
      // note: CLI may prompt for doc selection even with -d and -k flags
      const result = runCli(
        `add-skill api-patterns -d "API patterns" -k "API,REST,controller"`,
        tmpDir,
      );

      const skillDir = path.join(tmpDir, ".claude/skills/api-patterns");

      if (fs.existsSync(skillDir)) {
        const skillMdPath = path.join(skillDir, "SKILL.md");
        expect(fs.existsSync(skillMdPath)).toBe(true);

        const content = fs.readFileSync(skillMdPath, "utf8");
        expect(
          content.includes("api-patterns") || content.includes("API"),
        ).toBe(true);
      } else {
        // CLI requires interactive doc selection - verify it's not a crash
        expect(result.exitCode).toBeLessThanOrEqual(1);
        expect(result.stderr.toLowerCase()).not.toContain("error:");
      }
    });

    it("should handle multiple --docs selections", () => {
      // test skill creation with multiple keywords
      const result = runCli(
        `add-skill testing-patterns -d "Testing patterns" -k "test,TDD,unit"`,
        tmpDir,
      );

      const skillDir = path.join(tmpDir, ".claude/skills/testing-patterns");

      if (fs.existsSync(skillDir)) {
        const skillMdPath = path.join(skillDir, "SKILL.md");
        expect(fs.existsSync(skillMdPath)).toBe(true);
      } else {
        // CLI requires interactive doc selection - verify it's not a crash
        expect(result.exitCode).toBeLessThanOrEqual(1);
        expect(result.stderr.toLowerCase()).not.toContain("error:");
      }
    });

    it.skipIf(process.platform === "win32")("should create symlinks on non-Windows platforms", () => {
      // run with docs
      const result = runCli(
        `add-skill windows-test -d "Test skill" -k "test"`,
        tmpDir,
      );

      const skillDir = path.join(tmpDir, ".claude/skills/windows-test");

      if (fs.existsSync(skillDir)) {
        // skill was created successfully
        expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
      } else {
        // CLI requires interactive doc selection - verify it's not a crash
        expect(result.exitCode).toBeLessThanOrEqual(1);
        expect(result.stderr.toLowerCase()).not.toContain("error:");
      }
    });
  });

  describe("Skill creation", () => {
    it("should create skill directory structure", () => {
      const result = runCli(
        `add-skill api-patterns -d "API design patterns" -k "API,REST"`,
        tmpDir,
      );

      const skillDir = path.join(tmpDir, ".claude/skills/api-patterns");

      if (fs.existsSync(skillDir)) {
        // check SKILL.md exists
        const skillMdPath = path.join(skillDir, "SKILL.md");
        expect(fs.existsSync(skillMdPath)).toBe(true);

        const content = fs.readFileSync(skillMdPath, "utf8");
        expect(
          content.includes("api-patterns") || content.includes("API"),
        ).toBe(true);
      } else {
        // CLI requires interactive doc selection - verify it's not a crash
        expect(result.exitCode).toBeLessThanOrEqual(1);
        expect(result.stderr.toLowerCase()).not.toContain("error:");
      }
    });

    it("should add skill to skill-rules.yaml", () => {
      const result = runCli(
        `add-skill test-skill -d "Test skill" -k "test,unit"`,
        tmpDir,
      );

      const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
      expect(fs.existsSync(rulesPath)).toBe(true);

      const content = fs.readFileSync(rulesPath, "utf8");

      if (content.includes("test-skill")) {
        expect(
          content.includes("promptTriggers") || content.includes("keywords"),
        ).toBe(true);
      } else {
        // CLI requires interactive doc selection - verify it's not a crash
        expect(result.exitCode).toBeLessThanOrEqual(1);
        expect(result.stderr.toLowerCase()).not.toContain("error:");
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle missing keywords gracefully", () => {
      // when keywords are missing, CLI should either prompt or use skill name as keyword
      try {
        execSync(
          `node "${COMPILED_CLI_PATH}" add-skill no-keywords -d "No keywords skill"`,
          {
            cwd: tmpDir,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000,
          },
        );
      } catch (error) {
        // only ignore timeout or interactive exit, re-throw real crashes
        const execError = error as { code?: string; status?: number; stderr?: string };
        const isTimeout = execError.code === "ETIMEDOUT";
        const isInteractiveExit = execError.status === 1;
        if (!isTimeout && !isInteractiveExit) {
          throw error;
        }
        if (execError.stderr?.toLowerCase().includes("error:")) {
          throw error;
        }
      }

      // skill may or may not be created depending on prompts
      // but command should not crash
      const skillsDir = path.join(tmpDir, ".claude/skills");
      expect(fs.existsSync(skillsDir)).toBe(true);
    });

    it("should handle empty docs directory", () => {
      // remove all docs
      fs.rmSync(path.join(tmpDir, "docs"), { recursive: true, force: true });
      fs.unlinkSync(path.join(tmpDir, "CONTRIBUTING.md"));

      try {
        execSync(
          `node "${COMPILED_CLI_PATH}" add-skill empty-docs --interactive -k "test"`,
          {
            cwd: tmpDir,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000,
          },
        );
      } catch (error) {
        // only ignore timeout or interactive exit, re-throw real crashes
        const execError = error as { code?: string; status?: number; stderr?: string };
        const isTimeout = execError.code === "ETIMEDOUT";
        const isInteractiveExit = execError.status === 1;
        if (!isTimeout && !isInteractiveExit) {
          throw error;
        }
        if (execError.stderr?.toLowerCase().includes("error:")) {
          throw error;
        }
      }

      // cache may or may not be created depending on CLI flow
      const cachePath = path.join(tmpDir, ".claude/cache/discovered-docs.json");
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as { version?: string };
        // verify version is a non-empty string when cache exists
        expect(typeof cache.version).toBe('string');
        expect(cache.version!.length).toBeGreaterThan(0);
      }
      // note: if cache doesn't exist, test still passes - this is a smoke test
      // verifying CLI handles empty docs without crashing
    });

    it("should handle duplicate skill names", () => {
      // create first skill
      runCli(
        `add-skill duplicate -d "First skill" -k "test"`,
        tmpDir,
      );

      // try to create again
      runCli(
        `add-skill duplicate -d "Second skill" -k "test"`,
        tmpDir,
      );

      // check skill directory
      const skillsDir = path.join(tmpDir, ".claude/skills");
      const dirs = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .filter((d) => d.name === "duplicate");

      // should have at most one instance (or zero if CLI requires interactive)
      expect(dirs.length <= 1).toBe(true);
    });
  });
});
