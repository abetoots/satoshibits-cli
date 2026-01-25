import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sessionState } from "../../../src/helpers/internal/index.js";
import { createSession } from "../../../src/helpers/primitives/session.js";
import { createTestUI } from "../../../src/helpers/primitives/ui.js";
import { validators } from "../../../src/helpers/validators/index.js";

describe("layeredArchitecture validator", () => {
  let TEST_PROJECT_DIR: string;
  const TEST_SESSION_ID = "test-session-layered-arch";

  beforeEach(() => {
    // create a temporary directory for each test
    TEST_PROJECT_DIR = mkdtempSync(join(tmpdir(), "layered-arch-test-"));
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

  describe("controller → service separation", () => {
    it("should remind when controller directly accesses data layer", async () => {
      // arrange: create a controller that directly imports from data layer
      const srcDir = join(TEST_PROJECT_DIR, "src");
      const controllersDir = join(srcDir, "controllers");
      mkdirSync(controllersDir, { recursive: true });

      const badController = `
import { UserRepository } from '../data/user-repository';

export class UserController {
  private userRepo = new UserRepository();

  async getUser(id: string) {
    return this.userRepo.findById(id); // BAD: controller directly using repository
  }
}`;

      writeFileSync(join(controllersDir, "user-controller.ts"), badController);

      // simulate this file being modified
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/controllers/user-controller.ts",
      );

      // act: run validator
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should have reminder about layer violation
      const reminders = ui.getReminders();
      expect(reminders.length > 0).toBeTruthy();

      const layerViolation = reminders.find(
        (r) =>
          r.message.toLowerCase().includes("controller") &&
          r.message.toLowerCase().includes("service"),
      );
      expect(layerViolation).toBeTruthy();
      expect(layerViolation?.priority).toBe("medium");
    });

    it("should NOT remind when controller uses service layer", async () => {
      // arrange: create a proper controller that uses service
      const srcDir = join(TEST_PROJECT_DIR, "src");
      const controllersDir = join(srcDir, "controllers");
      mkdirSync(controllersDir, { recursive: true });

      const goodController = `
import { UserService } from '../services/user-service';

export class UserController {
  constructor(private userService: UserService) {}

  async getUser(id: string) {
    return this.userService.getUser(id); // GOOD: using service layer
  }
}`;

      writeFileSync(join(controllersDir, "user-controller.ts"), goodController);

      // simulate this file being modified
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/controllers/user-controller.ts",
      );

      // act: run validator
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should NOT have layer violation reminders
      const reminders = ui.getReminders();
      const layerViolation = reminders.find(
        (r) =>
          r.message.toLowerCase().includes("controller") &&
          r.message.toLowerCase().includes("repository"),
      );
      expect(layerViolation).toBeUndefined();
    });
  });

  describe("service layer validation", () => {
    it("should remind when service contains UI logic (React components)", async () => {
      // arrange: create a service with UI code
      const srcDir = join(TEST_PROJECT_DIR, "src");
      const servicesDir = join(srcDir, "services");
      mkdirSync(servicesDir, { recursive: true });

      const badService = `
import React from 'react';

export class UserService {
  renderUserCard(user: User) {
    return <div>{user.name}</div>; // BAD: UI logic in service layer
  }
}`;

      writeFileSync(join(servicesDir, "user-service.ts"), badService);
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/services/user-service.ts",
      );

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert
      const reminders = ui.getReminders();
      const uiInService = reminders.find(
        (r) =>
          r.message.toLowerCase().includes("service") &&
          (r.message.toLowerCase().includes("ui") ||
            r.message.toLowerCase().includes("react")),
      );
      expect(uiInService).toBeTruthy();
    });

    it("should allow service to use repositories", async () => {
      // arrange: proper service using repository
      const srcDir = join(TEST_PROJECT_DIR, "src");
      const servicesDir = join(srcDir, "services");
      mkdirSync(servicesDir, { recursive: true });

      const goodService = `
import { UserRepository } from '../data/user-repository';

export class UserService {
  constructor(private userRepo: UserRepository) {}

  async getUser(id: string) {
    return this.userRepo.findById(id); // GOOD: service can use repository
  }
}`;

      writeFileSync(join(servicesDir, "user-service.ts"), goodService);
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/services/user-service.ts",
      );

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should not complain about service → repository
      const reminders = ui.getReminders();
      const violation = reminders.find(
        (r) =>
          r.message.toLowerCase().includes("service") &&
          r.message.toLowerCase().includes("repository"),
      );
      expect(violation).toBe(undefined);
    });
  });

  describe("presentation layer validation", () => {
    it("should remind when component directly imports from data layer", async () => {
      // arrange: React component importing repository
      const srcDir = join(TEST_PROJECT_DIR, "src");
      const componentsDir = join(srcDir, "components");
      mkdirSync(componentsDir, { recursive: true });

      const badComponent = `
import React from 'react';
import { UserRepository } from '../data/user-repository';

export function UserProfile() {
  const userRepo = new UserRepository(); // BAD: component directly using data layer
  // ...
}`;

      writeFileSync(join(componentsDir, "UserProfile.tsx"), badComponent);
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/components/UserProfile.tsx",
      );

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert
      const reminders = ui.getReminders();
      const violation = reminders.find(
        (r) =>
          r.message.toLowerCase().includes("component") &&
          r.message.toLowerCase().includes("data"),
      );
      expect(violation).toBeTruthy();
    });

    it("should allow component to use hooks/services", async () => {
      // arrange: proper component using custom hook
      const srcDir = join(TEST_PROJECT_DIR, "src");
      const componentsDir = join(srcDir, "components");
      mkdirSync(componentsDir, { recursive: true });

      const goodComponent = `
import React from 'react';
import { useUser } from '../hooks/useUser';

export function UserProfile({ userId }: { userId: string }) {
  const user = useUser(userId); // GOOD: using hook/service layer
  return <div>{user?.name}</div>;
}`;

      writeFileSync(join(componentsDir, "UserProfile.tsx"), goodComponent);
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/components/UserProfile.tsx",
      );

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: no violations
      const reminders = ui.getReminders();
      expect(reminders.length).toBe(0);
    });
  });

  describe("multiple violations", () => {
    it("should report all violations with affected files", async () => {
      // arrange: multiple files with violations
      const srcDir = join(TEST_PROJECT_DIR, "src");

      // bad controller
      mkdirSync(join(srcDir, "controllers"), { recursive: true });
      writeFileSync(
        join(srcDir, "controllers", "user-controller.ts"),
        'import { UserRepository } from "../data/repo";\nclass UserController { repo = new UserRepository(); }',
      );
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/controllers/user-controller.ts",
      );

      // bad component
      mkdirSync(join(srcDir, "components"), { recursive: true });
      writeFileSync(
        join(srcDir, "components", "Profile.tsx"),
        'import { Database } from "../data/db";\nfunction Profile() { return <div />; }',
      );
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "src/components/Profile.tsx",
      );

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should have multiple reminders with files
      const reminders = ui.getReminders();
      expect(reminders.length > 0).toBeTruthy();

      const withFiles = reminders.filter((r) => r.file);
      expect(withFiles.length > 0).toBeTruthy();
    });
  });

  describe("edge cases", () => {
    it("should handle non-TypeScript files gracefully", async () => {
      // arrange: modify a JSON file
      sessionState.addModifiedFile(TEST_SESSION_ID, "package.json");

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should not crash and should not produce reminders for non-TS files
      const reminders = ui.getReminders();
      // non-TypeScript files should not trigger layered architecture reminders
      expect(reminders.length).toBe(0);
    });

    it("should skip node_modules and dist directories", async () => {
      // arrange: create file in node_modules
      const nodeModulesDir = join(TEST_PROJECT_DIR, "node_modules", "some-lib");
      mkdirSync(nodeModulesDir, { recursive: true });

      writeFileSync(
        join(nodeModulesDir, "index.js"),
        'import { Database } from "../../data/db";', // would be violation if checked
      );
      sessionState.addModifiedFile(
        TEST_SESSION_ID,
        "node_modules/some-lib/index.js",
      );

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should not report violations from node_modules
      const reminders = ui.getReminders();
      // should skip node_modules
      expect(reminders.length).toBe(0);
    });

    it("should handle missing files gracefully", async () => {
      // arrange: reference file that doesn't exist
      sessionState.addModifiedFile(TEST_SESSION_ID, "src/nonexistent.ts");

      // act
      const session = createSession(TEST_SESSION_ID, TEST_PROJECT_DIR);
      const ui = createTestUI();
      await validators.layeredArchitecture(session, ui);

      // assert: should not crash
      const reminders = ui.getReminders();
      // verify no critical reminders (errors)
      const errorReminders = reminders.filter((r) => r.priority === "critical");
      expect(errorReminders.length).toBe(0);
    });
  });
});
