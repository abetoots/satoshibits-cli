import fs from "fs";
import path from "path";

import {
  executeTemplateHook,
  setupMockProjectWithValidation,
} from "./helpers.js";

describe("stop-validator (Stop hook - feedback loop)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync("/tmp/validator-test-");
    setupMockProjectWithValidation(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Validation rule execution", () => {
    it("should validate activated skills only (feedback loop)", () => {
      // Step 1: Simulate UserPromptSubmit activating backend-dev-guidelines
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-feedback.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["src/api/users.ts"],
          activeDomains: [],
          lastActivatedSkills: { "backend-dev-guidelines": Date.now() },
          currentPromptSkills: ["backend-dev-guidelines"], // Activated!
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // Step 2: Create file with try-catch but NO Sentry
      const filePath = path.join(tmpDir, "src/api/users.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `async function createUser(data) {
  try {
    await db.user.create(data);
  } catch (error) {
    console.log(error); // Missing error tracking!
  }
}`,
        "utf8",
      );

      // Step 3: Run Stop hook
      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "feedback",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      // Step 4: Verify validation reminder appears with expected format
      expect(result.exitCode).toBe(0);

      // check for CODE QUALITY header (actual format from hook)
      expect(result.stdout.includes("CODE QUALITY")).toBe(true);

      // check for reminder text from validation rule
      expect(
        result.stdout.includes("Sentry") ||
          result.stdout.includes("captureException"),
      ).toBe(true);

      // check for file path in output
      expect(result.stdout.includes("users.ts")).toBe(true);

      // check for skill name in output
      expect(result.stdout.includes("backend-dev-guidelines")).toBe(true);
    });

    it("should NOT validate if skill was not activated", () => {
      // Session with NO activated skills
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-no-skills.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["src/api/test.ts"],
          activeDomains: [],
          lastActivatedSkills: {},
          currentPromptSkills: [], // No skills activated
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "no-skills",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      // Should exit silently (no validations to run)
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });

    it("should match condition patterns (pathPattern + content)", () => {
      // Setup: Activate skill and create file matching condition
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-condition.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["src/controllers/UserController.ts"],
          activeDomains: [],
          lastActivatedSkills: { "backend-dev-guidelines": Date.now() },
          currentPromptSkills: ["backend-dev-guidelines"],
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // Create file matching pathPattern: ".*/controllers?/.*"
      // AND content pattern: "prisma\\."
      const filePath = path.join(tmpDir, "src/controllers/UserController.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `export class UserController {
  async create(req, res) {
    const user = await prisma.user.create({ data: req.body });
    // Direct DB access - should use repo layer
    res.json(user);
  }
}`,
        "utf8",
      );

      // Add validation rule for repository pattern
      const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
      const rules = fs.readFileSync(rulesPath, "utf8");
      const updatedRules =
        rules +
        `      - name: "repository-pattern"
        condition:
          pathPattern: ".*/controllers?/.*"
          pattern: "prisma\\\\."
        requirement:
          pattern: "repository"
        reminder: "Are database operations using the repository pattern?"
`;
      fs.writeFileSync(rulesPath, updatedRules, "utf8");

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "condition",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(
        result.stdout.includes("repository") ||
          result.stdout.includes("UserController") ||
          result.stdout.includes("DATABASE"),
      ).toBe(true);
    });

    it("should NOT fail validation when requirement is met", () => {
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-passing.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["src/api/passing.ts"],
          activeDomains: [],
          lastActivatedSkills: { "backend-dev-guidelines": Date.now() },
          currentPromptSkills: ["backend-dev-guidelines"],
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // File WITH Sentry.captureException
      const filePath = path.join(tmpDir, "src/api/passing.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `import * as Sentry from '@sentry/node';

async function createUser(data) {
  try {
    await db.user.create(data);
  } catch (error) {
    Sentry.captureException(error); // ✅ Requirement met!
    throw error;
  }
}`,
        "utf8",
      );

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "passing",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      // Should exit successfully (validation requirement is met)
      expect(result.exitCode).toBe(0);
      // Output should NOT contain validation failure indicators
      // (file has Sentry.captureException, so error-tracking rule passes)
      expect(result.stdout.toLowerCase()).not.toContain("did you add");
      expect(result.stdout.toLowerCase()).not.toContain("missing");
    });

    it("should handle multiple validation rules per skill", () => {
      const sessionPath = path.join(tmpDir, ".claude/cache/session-multi.json");
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["src/api/multi.ts"],
          activeDomains: [],
          lastActivatedSkills: { "backend-dev-guidelines": Date.now() },
          currentPromptSkills: ["backend-dev-guidelines"],
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // File violating BOTH rules
      const filePath = path.join(tmpDir, "src/api/multi.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `async function handler() {
  try {
    await operation();
  } catch (error) {
    console.log(error); // Missing error tracking and logging
  }
}`,
        "utf8",
      );

      // Add second validation rule
      const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
      const rules = fs.readFileSync(rulesPath, "utf8");
      const updatedRules =
        rules +
        `      - name: "require-logging"
        condition:
          pattern: "catch\\\\s*\\\\("
        requirement:
          pattern: "logger\\\\.|console\\\\.error"
        reminder: "Did you add proper logging?"
`;
      fs.writeFileSync(rulesPath, updatedRules, "utf8");

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "multi",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      expect(result.exitCode).toBe(0);
      // Should show BOTH validation failures since file violates both rules
      // Each validation may output different keywords, so we check for alternatives
      const hasErrorTracking =
        result.stdout.includes("Sentry") ||
        result.stdout.includes("error-tracking");
      const hasLogging =
        result.stdout.includes("logging") ||
        result.stdout.includes("require-logging");
      // both validations must appear (file violates both rules)
      expect(hasErrorTracking).toBe(true);
      expect(hasLogging).toBe(true);
    });

    it("should prioritize critical skills in output", () => {
      // Add critical skill to session
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-priority.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["test.ts"],
          activeDomains: [],
          lastActivatedSkills: {
            "low-priority-skill": Date.now(),
            "critical-skill": Date.now(),
          },
          currentPromptSkills: ["low-priority-skill", "critical-skill"],
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // Add critical skill with validation rule
      const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
      const rules = fs.readFileSync(rulesPath, "utf8");
      const updatedRules =
        rules +
        `  critical-skill:
    type: guardrail
    enforcement: block
    priority: critical
    description: "Critical guardrail"
    promptTriggers:
      keywords: [test]
    validationRules:
      - name: "critical-check"
        condition:
          pattern: "test"
        requirement:
          pattern: "never-matches"
        reminder: "CRITICAL ISSUE"
  low-priority-skill:
    type: domain
    enforcement: suggest
    priority: low
    description: "Low priority"
    promptTriggers:
      keywords: [test]
    validationRules:
      - name: "low-check"
        condition:
          pattern: "test"
        requirement:
          pattern: "never-matches"
        reminder: "Low priority issue"
`;
      fs.writeFileSync(rulesPath, updatedRules, "utf8");

      fs.writeFileSync(path.join(tmpDir, "test.ts"), "test", "utf8");

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "priority",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      // Both skills should produce validation output
      expect(result.stdout).toContain("CRITICAL");
      expect(result.stdout).toContain("Low priority");

      // Critical skill should appear before low priority skill
      const criticalIndex = result.stdout.indexOf("CRITICAL");
      const lowIndex = result.stdout.indexOf("Low priority");
      expect(criticalIndex).toBeLessThan(lowIndex);
    });
  });

  describe("Graceful degradation", () => {
    it("should handle missing validation rules gracefully", () => {
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-no-rules.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["test.ts"],
          activeDomains: [],
          lastActivatedSkills: { "skill-without-rules": Date.now() },
          currentPromptSkills: ["skill-without-rules"],
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // Add skill without validationRules
      const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
      const rules = fs.readFileSync(rulesPath, "utf8");
      const updatedRules =
        rules +
        `  skill-without-rules:
    type: domain
    enforcement: suggest
    priority: medium
    description: "No validation rules"
    promptTriggers:
      keywords: [test]
`;
      fs.writeFileSync(rulesPath, updatedRules, "utf8");

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "no-rules",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      // Should exit gracefully
      expect(result.exitCode).toBe(0);
    });

    it("should handle file read errors gracefully", () => {
      const sessionPath = path.join(
        tmpDir,
        ".claude/cache/session-missing-file.json",
      );
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          modifiedFiles: ["nonexistent.ts"], // File doesn't exist
          activeDomains: [],
          lastActivatedSkills: { "backend-dev-guidelines": Date.now() },
          currentPromptSkills: ["backend-dev-guidelines"],
          toolUseCount: 0,
          createdAt: Date.now(),
        }),
        "utf8",
      );

      const result = executeTemplateHook(
        "stop-validator.ts",
        {
          session_id: "missing-file",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );

      // Should not crash
      expect(result.exitCode).toBe(0);
    });
  });
});
