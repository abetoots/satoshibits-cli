import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sessionState } from "../../../src/helpers/internal/index.js";
import { createSession } from "../../../src/helpers/primitives/session.js";

// note: these tests use sessionState.init() which modifies a global singleton.
// vitest runs tests in a single file sequentially by default, so this is safe.
// do not use --threads or --pool=threads for this test file.
describe("Session primitive", () => {
  const TEST_SESSION_ID = "test-session-123";
  let TEST_PROJECT_DIR: string;

  beforeEach(() => {
    // create a temporary directory for each test
    TEST_PROJECT_DIR = mkdtempSync(join(tmpdir(), "session-test-"));
    // initialize session state before each test
    sessionState.init(TEST_PROJECT_DIR);
  });

  afterEach(() => {
    // cleanup temporary directory
    try {
      rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
    } catch (_error) {
      // ignore cleanup errors
    }
  });

  describe("projectDir", () => {
    it("should expose projectDir property", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.projectDir).toBe(TEST_PROJECT_DIR);
    });
  });

  describe("isSkillActive", () => {
    it("should return true when skill is activated", () => {
      sessionState.recordSkillActivation(TEST_SESSION_ID, "frontend-dev");

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.isSkillActive("frontend-dev")).toBe(true);
    });

    it("should return false when skill is not activated", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.isSkillActive("frontend-dev")).toBe(false);
    });

    it("should be case-sensitive", () => {
      sessionState.recordSkillActivation(TEST_SESSION_ID, "frontend-dev");

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.isSkillActive("Frontend-Dev")).toBe(false);
    });

    it("should handle empty string input", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.isSkillActive("")).toBe(false);
    });
  });

  describe("getActivatedSkills", () => {
    it("should return empty array when no skills activated", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.getActivatedSkills()).toEqual([]);
    });

    it("should return all activated skills", () => {
      sessionState.recordSkillActivation(TEST_SESSION_ID, "frontend-dev");
      sessionState.recordSkillActivation(TEST_SESSION_ID, "backend-dev");

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const skills = session.getActivatedSkills();

      expect(skills.length).toBe(2);
      expect(skills.includes("frontend-dev")).toBeTruthy();
      expect(skills.includes("backend-dev")).toBeTruthy();
    });
  });

  describe("getModifiedFiles", () => {
    it("should return empty array when no files modified", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      expect(session.getModifiedFiles()).toEqual([]);
    });

    it("should return ModifiedFile objects with content", () => {
      // create test files
      writeFileSync(
        join(TEST_PROJECT_DIR, "Button.tsx"),
        "export const Button = () => {}",
      );
      writeFileSync(
        join(TEST_PROJECT_DIR, "users.ts"),
        "export const getUser = () => {}",
      );

      sessionState.addModifiedFile(TEST_SESSION_ID, "Button.tsx");
      sessionState.addModifiedFile(TEST_SESSION_ID, "users.ts");

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const files = session.getModifiedFiles();

      expect(files.length).toBe(2);

      // check first file
      expect(files[0]!.path).toBe("Button.tsx");
      expect(files[0]!.absolutePath).toBe(join(TEST_PROJECT_DIR, "Button.tsx"));
      expect(files[0]!.content).toBe("export const Button = () => {}");
      expect(files[0]!.extension).toBe(".tsx");

      // check second file
      expect(files[1]!.path).toBe("users.ts");
      expect(files[1]!.absolutePath).toBe(join(TEST_PROJECT_DIR, "users.ts"));
      expect(files[1]!.content).toBe("export const getUser = () => {}");
      expect(files[1]!.extension).toBe(".ts");
    });

    it("should handle missing files gracefully", () => {
      sessionState.addModifiedFile(TEST_SESSION_ID, "nonexistent.ts");

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const files = session.getModifiedFiles();

      expect(files.length).toBe(1);
      expect(files[0]!.path).toBe("nonexistent.ts");
      expect(files[0]!.content).toBe(""); // empty content for missing files
    });
  });

  describe("hasModifiedFiles", () => {
    beforeEach(() => {
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/components/Button.tsx",
      );
      sessionState.addModifiedFile(TEST_SESSION_ID, "src/api/users.ts");
      sessionState.addModifiedFile(TEST_SESSION_ID, "tests/Button.test.tsx");
    });

    it("should match files with string pattern", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);

      expect(session.hasModifiedFiles("components")).toBe(true);
      expect(session.hasModifiedFiles("api")).toBe(true);
      expect(session.hasModifiedFiles("tests")).toBe(true);
      expect(session.hasModifiedFiles("nonexistent")).toBe(false);
    });

    it("should match files with regex pattern", () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);

      expect(session.hasModifiedFiles(/\.tsx$/)).toBe(true);
      expect(session.hasModifiedFiles(/\.ts$/)).toBe(true);
      expect(session.hasModifiedFiles(/^src\/components/)).toBe(true);
      expect(session.hasModifiedFiles(/\.py$/)).toBe(false);
    });

    it("should handle empty modified files", () => {
      const emptySession = createSession("empty-session", TEST_PROJECT_DIR);

      expect(emptySession.hasModifiedFiles("anything")).toBe(false);
      expect(emptySession.hasModifiedFiles(/anything/)).toBe(false);
    });
  });

  describe("session isolation", () => {
    it("should isolate different sessions", () => {
      const SESSION_1 = "session-1";
      const SESSION_2 = "session-2";

      sessionState.recordSkillActivation(SESSION_1, "frontend-dev");
      sessionState.addModifiedFile(SESSION_1, "src/file1.ts");

      sessionState.recordSkillActivation(SESSION_2, "backend-dev");
      sessionState.addModifiedFile(SESSION_2, "src/file2.ts");

      const session1 = createSession(SESSION_1, TEST_PROJECT_DIR);
      const session2 = createSession(SESSION_2, TEST_PROJECT_DIR);

      // session 1 should only see its own data
      expect(session1.isSkillActive("frontend-dev")).toBe(true);
      expect(session1.isSkillActive("backend-dev")).toBe(false);
      const files1 = session1.getModifiedFiles();
      expect(files1.length).toBe(1);
      expect(files1[0]!.path).toBe("src/file1.ts");

      // session 2 should only see its own data
      expect(session2.isSkillActive("backend-dev")).toBe(true);
      expect(session2.isSkillActive("frontend-dev")).toBe(false);
      const files2 = session2.getModifiedFiles();
      expect(files2.length).toBe(1);
      expect(files2[0]!.path).toBe("src/file2.ts");
    });
  });
});
