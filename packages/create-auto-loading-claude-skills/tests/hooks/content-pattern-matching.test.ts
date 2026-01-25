import fs from "fs";
import path from "path";

import {
  executeTemplateHook,
  setupMockProjectWithContentPatterns,
} from "./helpers.js";

describe("Content pattern matching (fileTriggers.contentPatterns)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync("/tmp/content-test-");
    setupMockProjectWithContentPatterns(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should activate skill based on import patterns", () => {
    // create file with Express import in a path that matches pathPattern
    // path must match "src/api/**/*.ts" and content must match "import.*express"
    const filePath = path.join(tmpDir, "src/api/server.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `import express from 'express';
import { Router } from 'express';

const app = express();`,
      "utf8",
    );

    // record file modification
    const sessionPath = path.join(tmpDir, ".claude/cache/session-content.json");
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        modifiedFiles: ["src/api/server.ts"],
        activeDomains: [],
        lastActivatedSkills: {},
        currentPromptSkills: [],
        toolUseCount: 0,
        createdAt: Date.now(),
      }),
      "utf8",
    );

    const result = executeTemplateHook(
      "skill-activation-prompt.ts",
      {
        prompt: "How should I structure this?",
        session_id: "content",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // should activate based on BOTH path match (src/api/**/*.ts) AND content match (import.*express)
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("backend-dev-guidelines")).toBe(true);
  });

  it("should activate skill based on class inheritance patterns", () => {
    const filePath = path.join(tmpDir, "src/UserController.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `export class UserController extends BaseController {
  async index() {
    // ...
  }
}`,
      "utf8",
    );

    const sessionPath = path.join(tmpDir, ".claude/cache/session-class.json");
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        modifiedFiles: ["src/UserController.ts"],
        activeDomains: [],
        lastActivatedSkills: {},
        currentPromptSkills: [],
        toolUseCount: 0,
        createdAt: Date.now(),
      }),
      "utf8",
    );

    // Add skill with class pattern
    const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
    const rules = fs.readFileSync(rulesPath, "utf8");
    const updatedRules = rules.replace(
      "contentPatterns:",
      `contentPatterns:
        - "extends BaseController"`,
    );
    fs.writeFileSync(rulesPath, updatedRules, "utf8");

    const result = executeTemplateHook(
      "skill-activation-prompt.ts",
      {
        prompt: "Add validation",
        session_id: "class",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("backend-dev-guidelines")).toBe(true);
  });

  it("should contribute to activation score (fileContentMatchScore)", () => {
    // File with BOTH path match AND content match = higher score
    const filePath = path.join(tmpDir, "src/api/routes.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `import express from 'express';
export const router = express.Router();`,
      "utf8",
    );

    const sessionPath = path.join(tmpDir, ".claude/cache/session-score.json");
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        modifiedFiles: ["src/api/routes.ts"],
        activeDomains: [],
        lastActivatedSkills: {},
        currentPromptSkills: [],
        toolUseCount: 0,
        createdAt: Date.now(),
      }),
      "utf8",
    );

    const result = executeTemplateHook(
      "skill-activation-prompt.ts",
      {
        prompt: "generic question", // Weak prompt match
        session_id: "score",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Should activate based on file context alone
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("backend-dev-guidelines")).toBe(true);
  });

  it("should NOT activate when content pattern does not match", () => {
    // file in backend path but NO Express import or Controller export
    // when contentPatterns are specified, files must match BOTH path AND content
    const filePath = path.join(tmpDir, "src/api/utils.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `export function formatDate(date: Date): string {
  return date.toISOString();
}`,
      "utf8",
    );

    const sessionPath = path.join(
      tmpDir,
      ".claude/cache/session-no-match.json",
    );
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        modifiedFiles: ["src/api/utils.ts"],
        activeDomains: [],
        lastActivatedSkills: {},
        currentPromptSkills: [],
        toolUseCount: 0,
        createdAt: Date.now(),
      }),
      "utf8",
    );

    const result = executeTemplateHook(
      "skill-activation-prompt.ts",
      {
        prompt: "generic question",
        session_id: "no-match",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // path matches (src/api/) but content doesn't (no express import)
    // skill should NOT activate because content pattern is required when specified
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("backend-dev-guidelines")).toBe(false);
  });

  it("should scan multiple content patterns", () => {
    const filePath = path.join(tmpDir, "src/api/controller.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `export class UserController {
  async list() {
    return [];
  }
}`,
      "utf8",
    );

    const sessionPath = path.join(
      tmpDir,
      ".claude/cache/session-multi-pattern.json",
    );
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        modifiedFiles: ["src/api/controller.ts"],
        activeDomains: [],
        lastActivatedSkills: {},
        currentPromptSkills: [],
        toolUseCount: 0,
        createdAt: Date.now(),
      }),
      "utf8",
    );

    const result = executeTemplateHook(
      "skill-activation-prompt.ts",
      {
        prompt: "test",
        session_id: "multi-pattern",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Should match "export.*Controller" pattern
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("backend-dev-guidelines")).toBe(true);
  });
});
