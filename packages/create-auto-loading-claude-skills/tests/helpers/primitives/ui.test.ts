import { describe, it, expect } from "vitest";

import { createTestUI, createUI } from "../../../src/helpers/primitives/ui.js";

describe("UI primitive", () => {
  describe("createTestUI", () => {
    it("should collect single reminder", () => {
      const ui = createTestUI();

      ui.addReminder({
        message: "Test reminder",
        priority: "medium",
      });

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.message).toBe("Test reminder");
      expect(reminders[0]!.priority).toBe("medium");
    });

    it("should collect multiple reminders", () => {
      const ui = createTestUI();

      ui.addReminders([
        { message: "First reminder", priority: "low" },
        { message: "Second reminder", priority: "high" },
      ]);

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(2);
      expect(reminders[0]!.message).toBe("First reminder");
      expect(reminders[1]!.message).toBe("Second reminder");
    });

    it("should include file and skillName in reminder", () => {
      const ui = createTestUI();

      ui.addReminder({
        message: "File needs attention",
        file: "src/file1.ts",
        skillName: "frontend-dev",
      });

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.file).toBe("src/file1.ts");
      expect(reminders[0]!.skillName).toBe("frontend-dev");
    });

    it("should handle reminder without priority", () => {
      const ui = createTestUI();

      ui.addReminder({
        message: "Default priority reminder",
      });

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(1);
      expect(reminders[0]!.priority).toBe(undefined);
    });

    it("should accumulate reminders from mixed calls", () => {
      const ui = createTestUI();

      ui.addReminder({ message: "Single" });
      ui.addReminders([{ message: "Batch 1" }, { message: "Batch 2" }]);
      ui.addReminder({ message: "Another single" });

      const reminders = ui.getReminders();
      expect(reminders.length).toBe(4);
    });

    it("should return copy of reminders array", () => {
      const ui = createTestUI();

      ui.addReminder({ message: "Test" });
      const reminders1 = ui.getReminders();
      const reminders2 = ui.getReminders();

      expect(reminders1).not.toBe(reminders2);
      expect(reminders1).toEqual(reminders2);
    });
  });

  describe("createUI", () => {
    it("should have same interface as test UI", () => {
      const ui = createUI();

      // should have addReminder method
      expect(typeof ui.addReminder).toBe("function");

      // should have addReminders method
      expect(typeof ui.addReminders).toBe("function");
    });

    it("should flush reminders to console", () => {
      // cast to include internal _flush method for testing
      const ui = createUI() as ReturnType<typeof createUI> & { _flush: () => void };
      const logs: string[] = [];

      // mock console.log
      const originalLog = console.log;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log = vi.fn((...args: any[]) => {
        logs.push(args.join(" "));
      });

      ui.addReminder({
        message: "Test message",
        priority: "high",
      });

      ui._flush();

      // restore console.log
      console.log = originalLog;

      // verify output
      expect(logs.some((log) => log.includes("VALIDATION REMINDERS"))).toBeTruthy();
      expect(logs.some((log) => log.includes("Test message"))).toBeTruthy();
    });

    it("should not flush when no reminders", () => {
      // cast to include internal _flush method for testing
      const ui = createUI() as ReturnType<typeof createUI> & { _flush: () => void };
      const logs: string[] = [];

      const originalLog = console.log;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log = vi.fn((...args: any[]) => {
        logs.push(args.join(" "));
      });

      ui._flush();

      console.log = originalLog;

      // should not have printed anything
      expect(logs.length).toBe(0);
    });
  });

  describe("priority levels", () => {
    it("should support critical priority", () => {
      const ui = createTestUI();
      ui.addReminder({ message: "Critical", priority: "critical" });

      const reminders = ui.getReminders();
      expect(reminders[0]!.priority).toBe("critical");
    });

    it("should support high priority", () => {
      const ui = createTestUI();
      ui.addReminder({ message: "High", priority: "high" });

      const reminders = ui.getReminders();
      expect(reminders[0]!.priority).toBe("high");
    });

    it("should support medium priority", () => {
      const ui = createTestUI();
      ui.addReminder({ message: "Medium", priority: "medium" });

      const reminders = ui.getReminders();
      expect(reminders[0]!.priority).toBe("medium");
    });

    it("should support low priority", () => {
      const ui = createTestUI();
      ui.addReminder({ message: "Low", priority: "low" });

      const reminders = ui.getReminders();
      expect(reminders[0]!.priority).toBe("low");
    });
  });
});
