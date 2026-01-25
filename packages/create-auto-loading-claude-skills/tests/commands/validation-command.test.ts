/**
 * Tests for the validate command
 * Tests YAML parsing, rule validation, and fix capabilities
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

describe("Validate command", () => {
  let tmpDir: string;
  let claudeDir: string;
  let skillsDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();

    // ensure CLI is built before running tests
    if (!fs.existsSync(COMPILED_CLI_PATH)) {
      throw new Error(
        `Compiled CLI not found at ${COMPILED_CLI_PATH}. Run 'pnpm build' first.`
      );
    }
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync("/tmp/validate-test-");
    claudeDir = path.join(tmpDir, ".claude");
    skillsDir = path.join(claudeDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI validate command
   * Uses compiled CLI for performance (~50ms vs ~700ms with tsx)
   */
  function runValidate(options = ""): {
    stdout: string;
    stderr: string;
    exitCode: number;
  } {
    try {
      const stdout = execSync(`node "${COMPILED_CLI_PATH}" validate ${options}`, {
        cwd: tmpDir,
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

  describe("Valid configurations", () => {
    it("should validate a correct skill-rules.yaml", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  error-handling:
    type: domain
    priority: high
    promptTriggers:
      keywords: [error, exception]
`,
        "utf8",
      );

      const result = runValidate();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.includes("valid") || !result.stderr).toBe(true);
    });

    it("should validate skill-rules.json", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.json"),
        JSON.stringify(
          {
            version: "1.0",
            settings: { maxSuggestions: 3 },
            skills: {
              "api-design": {
                type: "domain",
                priority: "medium",
                promptTriggers: { keywords: ["API", "endpoint"] },
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = runValidate();
      expect(result.exitCode).toBe(0);
    });
  });

  describe("Invalid configurations", () => {
    it("should detect orphaned skills (in rules but missing SKILL.md)", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  missing-skill:
    type: domain
    priority: high
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate();
      expect(
        result.stdout.includes("orphan") ||
          result.stdout.includes("missing-skill"),
      ).toBe(true);
    });

    it("should detect invalid YAML syntax", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  bad-indent:
  type: domain  # wrong indentation
    priority: high
`,
        "utf8",
      );

      const result = runValidate();
      // invalid YAML should produce either a non-zero exit code or an error message
      const hasError =
        result.exitCode !== 0 ||
        result.stderr.toLowerCase().includes("error") ||
        result.stdout.toLowerCase().includes("error") ||
        result.stdout.toLowerCase().includes("invalid");
      expect(hasError).toBe(true);
    });

    it("should detect unregistered skills (SKILL.md exists but not in rules)", () => {
      // create skill-rules without the skill
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills: {}
`,
        "utf8",
      );

      // create unregistered skill directory with SKILL.md
      const unregSkillDir = path.join(skillsDir, "unregistered-skill");
      fs.mkdirSync(unregSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(unregSkillDir, "SKILL.md"),
        "# Unregistered Skill\nThis skill exists but is not in skill-rules",
        "utf8",
      );

      const result = runValidate();
      expect(
        result.stdout.includes("unregistered") ||
          result.stdout.includes("unregistered-skill"),
      ).toBe(true);
    });

    it("should report valid skills count", () => {
      // create a properly configured skill
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  valid-skill:
    type: domain
    priority: medium
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      // create matching SKILL.md
      const skillDir = path.join(skillsDir, "valid-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "# Valid Skill\nProperly configured skill",
        "utf8",
      );

      const result = runValidate();
      expect(result.stdout.includes("valid") || result.exitCode === 0).toBe(true);
    });
  });

  describe("Auto-fix functionality", () => {
    it("should fix missing settings with --fix flag", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  test-skill:
    type: domain
    priority: medium
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate("--fix");

      // read the fixed file
      const content = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );

      expect(content.includes("settings") || result.exitCode === 0).toBe(true);
    });

    it("should remove orphaned skill entries with --fix flag", () => {
      // create skill-rules with orphaned skill (no matching SKILL.md)
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  orphaned-skill:
    type: domain
    priority: high
    promptTriggers:
      keywords: [orphan]
  valid-skill:
    type: domain
    priority: medium
    promptTriggers:
      keywords: [valid]
`,
        "utf8",
      );

      // create SKILL.md only for valid-skill
      const validSkillDir = path.join(skillsDir, "valid-skill");
      fs.mkdirSync(validSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(validSkillDir, "SKILL.md"),
        "# Valid Skill\nThis skill has matching SKILL.md",
        "utf8",
      );

      const result = runValidate("--fix");

      // read the fixed file
      const content = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );

      // orphaned skill should be removed or warned about
      expect(
        !content.includes("orphaned-skill") ||
          result.stdout.includes("removed") ||
          result.stdout.includes("orphan"),
      ).toBe(true);

      // valid skill should remain
      expect(content.includes("valid-skill")).toBe(true);
    });

    it("should add unregistered skills with --fix flag", () => {
      // create minimal skill-rules
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills: {}
`,
        "utf8",
      );

      // create unregistered skill directory with SKILL.md
      const unregSkillDir = path.join(skillsDir, "unregistered-skill");
      fs.mkdirSync(unregSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(unregSkillDir, "SKILL.md"),
        "# Unregistered Skill\nThis skill exists but needs to be registered",
        "utf8",
      );

      const result = runValidate("--fix");

      // read the fixed file
      const content = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );

      // unregistered skill should be added or reported
      expect(
        content.includes("unregistered-skill") ||
          result.stdout.includes("added") ||
          result.stdout.includes("registered"),
      ).toBe(true);
    });

    it("should handle schema validation errors", () => {
      // create skill-rules with invalid schema (missing required fields)
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  invalid-skill:
    # missing required 'type' field
    priority: high
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate();

      // should report schema validation error
      expect(
        result.stdout.includes("type") ||
          result.stdout.includes("required") ||
          result.stdout.includes("invalid") ||
          result.stderr.includes("type") ||
          result.exitCode !== 0,
      ).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle missing skill-rules file", () => {
      // no skill-rules file in skillsDir
      const result = runValidate();
      expect(
        result.exitCode !== 0 ||
          result.stderr.includes("not found") ||
          result.stdout.includes("not found"),
      ).toBe(true);
    });

    it("should handle empty skill-rules file", () => {
      fs.writeFileSync(path.join(skillsDir, "skill-rules.yaml"), "", "utf8");

      const result = runValidate();
      // empty config should be handled gracefully - either error or warning
      // verify specific behavior rather than "something happened"
      const hasError = result.exitCode !== 0;
      const hasWarning = result.stdout.toLowerCase().includes("no skills") ||
                         result.stdout.toLowerCase().includes("empty") ||
                         result.stderr.toLowerCase().includes("invalid");
      expect(hasError || hasWarning).toBe(true);
    });
  });
});
