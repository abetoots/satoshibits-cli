import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ValidatorContext } from "../../../src/helpers/primitives/create-validator.js";

import { sessionState } from "../../../src/helpers/internal/index.js";
import {
  createValidator,
  runValidators,
} from "../../../src/helpers/primitives/create-validator.js";
import { createSession } from "../../../src/helpers/primitives/session.js";
import { createTestUI } from "../../../src/helpers/primitives/ui.js";

describe("createValidator primitive", () => {
  const TEST_SESSION_ID = "test-session-123";
  let TEST_PROJECT_DIR: string;

  beforeEach(() => {
    // create a temporary directory for each test
    TEST_PROJECT_DIR = mkdtempSync(join(tmpdir(), "validator-test-"));
    sessionState.init(TEST_PROJECT_DIR);
  });

  afterEach(() => {
    // cleanup temporary directory
    try {
      rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
    } catch (error) {
      // log cleanup errors for debugging but don't fail the test
      console.warn(
        `[test cleanup] Failed to remove ${TEST_PROJECT_DIR}:`,
        error,
      );
    }
  });

  describe("basic validator creation", () => {
    it("should create a callable validator with name", () => {
      const validator = createValidator({
        name: "test-validator",
        validate: () => {
          /* noop for testing */
        },
      });

      expect(validator.name).toBe("test-validator");
      expect(typeof validator).toBe("function");
    });

    it("should include optional description", () => {
      const validator = createValidator({
        name: "test-validator",
        description: "A test validator",
        validate: () => {
          /* noop for testing */
        },
      });

      expect(validator.description).toBe("A test validator");
    });
  });

  describe("validator execution", () => {
    it("should pass context to validator function", async () => {
      let capturedContext: ValidatorContext | null = null;

      const validator = createValidator({
        name: "test-validator",
        validate: (context) => {
          capturedContext = context;
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      // use expect for proper type narrowing
      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.session).toBeDefined();
      expect(capturedContext!.ui).toBeDefined();
      expect(capturedContext!.session.projectDir).toBe(TEST_PROJECT_DIR);
    });

    it("should allow validator to add reminders", async () => {
      const validator = createValidator({
        name: "test-validator",
        validate: ({ ui }) => {
          ui.addReminder({
            message: "Test reminder",
            priority: "high",
          });
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.message).toBe("Test reminder");
    });

    it("should support async validators", async () => {
      const validator = createValidator({
        name: "async-validator",
        validate: async ({ ui }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          ui.addReminder({ message: "Async reminder" });
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.message).toBe("Async reminder");
    });

    it("should support options parameter", async () => {
      let capturedOptions: { threshold: number } | undefined;

      const validator = createValidator<{ threshold: number }>({
        name: "options-validator",
        validate: (_context, options) => {
          capturedOptions = options;
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui, { threshold: 10 });

      expect(capturedOptions).toEqual({ threshold: 10 });
    });
  });

  describe("session access", () => {
    it("should access activated skills", async () => {
      sessionState.recordSkillActivation(TEST_SESSION_ID, "frontend-dev");

      const validator = createValidator({
        name: "skill-checker",
        validate: ({ session, ui }) => {
          if (session.isSkillActive("frontend-dev")) {
            ui.addReminder({ message: "Frontend skill active" });
          }
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.message).toBe("Frontend skill active");
    });

    it("should access modified files", async () => {
      sessionState.addModifiedFile(TEST_SESSION_ID, "src/api/users.ts");

      const validator = createValidator({
        name: "file-checker",
        validate: ({ session, ui }) => {
          if (session.hasModifiedFiles(/\.ts$/)) {
            ui.addReminder({ message: "TypeScript files modified" });
          }
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should catch sync errors and add error reminder", async () => {
      const validator = createValidator({
        name: "failing-validator",
        validate: () => {
          throw new Error("Validation failed");
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.priority).toBe("high");
      expect(reminders[0]!.message.includes("failing-validator")).toBeTruthy();
      expect(reminders[0]!.message.includes("Validation failed")).toBeTruthy();
    });

    it("should catch async errors and add error reminder", async () => {
      const validator = createValidator({
        name: "async-failing-validator",
        validate: async () => {
          await Promise.resolve();
          throw new Error("Async validation failed");
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validator(session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.priority).toBe("high");
      expect(reminders[0]!.message.includes("Async validation failed")).toBeTruthy();
    });

    it("should not throw errors even if validator fails", async () => {
      const validator = createValidator({
        name: "failing-validator",
        validate: () => {
          throw new Error("Should not propagate");
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();

      // should not throw - if it does, the test will fail
      await validator(session, ui);
    });
  });

  describe("runValidators", () => {
    it("should run multiple validators in sequence", async () => {
      const executionOrder: string[] = [];

      const validator1 = createValidator({
        name: "validator-1",
        validate: ({ ui }) => {
          executionOrder.push("v1");
          ui.addReminder({ message: "Reminder 1" });
        },
      });

      const validator2 = createValidator({
        name: "validator-2",
        validate: ({ ui }) => {
          executionOrder.push("v2");
          ui.addReminder({ message: "Reminder 2" });
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await runValidators([validator1, validator2], session, ui);

      expect(executionOrder).toEqual(["v1", "v2"]);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(2);
      expect(reminders[0]!.message).toBe("Reminder 1");
      expect(reminders[1]!.message).toBe("Reminder 2");
    });

    it("should continue running validators even if one fails", async () => {
      const validator1 = createValidator({
        name: "failing-validator",
        validate: () => {
          throw new Error("Failed");
        },
      });

      const validator2 = createValidator({
        name: "passing-validator",
        validate: ({ ui }) => {
          ui.addReminder({ message: "Success" });
        },
      });

      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await runValidators([validator1, validator2], session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(2); // error from v1 + success from v2
      expect(reminders[1]!.message).toBe("Success");
    });

    it("should handle empty validator array", async () => {
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();

      // should not throw - if it does, the test will fail
      await runValidators([], session, ui);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(0);
    });
  });
});
