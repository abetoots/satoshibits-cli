import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { checkSyncStatus, syncCommand } from "../../src/commands/sync.js";

// note: these tests use process.chdir() which affects global state.
// this is intentional because the syncCommand function reads from cwd.
// vitest runs tests in a single file sequentially, so this is safe.
// the originalCwd is restored in afterEach to avoid affecting other tests.
describe("sync command", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
    originalCwd = process.cwd();
    process.chdir(testDir);

    // suppress console output during tests
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("syncCommand", () => {
    it("should handle empty project (no .claude/commands/)", async () => {
      await syncCommand({ verbose: false });

      // should not create skill-rules.yaml
      const configPath = path.join(
        testDir,
        ".claude",
        "skills",
        "skill-rules.yaml",
      );
      expect(fs.existsSync(configPath)).toBe(false);
    });

    it("should sync skills with x-smart-triggers", async () => {
      // create skill with x-smart-triggers
      const skillDir = path.join(testDir, ".claude", "commands", "terraform");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `---
name: terraform-apply
description: Applies Terraform execution plan

x-smart-triggers:
  activationStrategy: guaranteed
  promptTriggers:
    keywords:
      - terraform
      - apply
    intentPatterns:
      - "(apply|deploy).*terraform"
  fileTriggers:
    pathPatterns:
      - "*.tfplan"
      - "*.tf"
  cooldownMinutes: 30
---

# Terraform Apply

This skill helps with Terraform apply operations.
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);

      await syncCommand({ verbose: false });

      // check generated config
      const configPath = path.join(
        testDir,
        ".claude",
        "skills",
        "skill-rules.yaml",
      );
      expect(fs.existsSync(configPath)).toBe(true);

      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<
        string,
        unknown
      >;
      expect(config.skills).toBeDefined();
      expect(
        (config.skills as Record<string, unknown>)["terraform-apply"],
      ).toBeDefined();

      const rule = (config.skills as Record<string, Record<string, unknown>>)[
        "terraform-apply"
      ]!;
      expect(rule.activationStrategy).toBe("guaranteed");
      expect(rule.promptTriggers).toEqual({
        keywords: ["terraform", "apply"],
        intentPatterns: ["(apply|deploy).*terraform"],
      });
      expect(rule.fileTriggers).toEqual({
        pathPatterns: ["*.tfplan", "*.tf"],
      });
      expect(rule.cooldownMinutes).toBe(30);
    });

    it("should skip skills without x-smart-triggers", async () => {
      // create skill without x-smart-triggers
      const skillDir = path.join(testDir, ".claude", "commands", "simple");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `---
name: simple-skill
description: A simple skill without triggers
---

# Simple Skill

Just a simple skill.
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);

      await syncCommand({ verbose: false });

      // config should be created but with no synced skills
      const configPath = path.join(
        testDir,
        ".claude",
        "skills",
        "skill-rules.yaml",
      );
      expect(fs.existsSync(configPath)).toBe(true);

      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<
        string,
        unknown
      >;
      expect(
        Object.keys(config.skills as Record<string, unknown>),
      ).toHaveLength(0);
    });

    it("should preserve manual skills not in SKILL.md", async () => {
      // create existing config with manual skill
      const skillsDir = path.join(testDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });

      const existingConfig = {
        version: "2.0",
        skills: {
          "manual-skill": {
            type: "domain",
            enforcement: "suggest",
            priority: "medium",
            description: "A manually added skill",
            promptTriggers: {
              keywords: ["manual"],
            },
          },
        },
      };

      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        yaml.dump(existingConfig),
      );

      // create a new skill with x-smart-triggers
      const skillDir = path.join(testDir, ".claude", "commands", "new-skill");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `---
name: new-skill
description: A new skill

x-smart-triggers:
  activationStrategy: suggestive
  promptTriggers:
    keywords:
      - new
---

# New Skill
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);

      await syncCommand({ verbose: false });

      // check that both skills are present
      const configPath = path.join(skillsDir, "skill-rules.yaml");
      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<
        string,
        unknown
      >;
      const skills = config.skills as Record<string, unknown>;

      expect(skills["manual-skill"]).toBeDefined();
      expect(skills["new-skill"]).toBeDefined();
    });

    it("should respect dry-run option", async () => {
      // create skill with x-smart-triggers
      const skillDir = path.join(testDir, ".claude", "commands", "test-skill");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `---
name: test-skill
x-smart-triggers:
  activationStrategy: guaranteed
---

# Test
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);

      await syncCommand({ dryRun: true });

      // config should NOT be created in dry-run mode
      const configPath = path.join(
        testDir,
        ".claude",
        "skills",
        "skill-rules.yaml",
      );
      expect(fs.existsSync(configPath)).toBe(false);
    });

    it("should include sync metadata", async () => {
      // create skill with x-smart-triggers
      const skillDir = path.join(testDir, ".claude", "commands", "meta-skill");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `---
name: meta-skill
x-smart-triggers:
  activationStrategy: suggestive
---

# Meta
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);

      await syncCommand({ verbose: false });

      const configPath = path.join(
        testDir,
        ".claude",
        "skills",
        "skill-rules.yaml",
      );
      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<
        string,
        unknown
      >;

      expect(config._sync).toBeDefined();
      const sync = config._sync as Record<string, unknown>;
      expect(sync.lastSync).toBeDefined();
      expect(sync.checksum).toBeDefined();
      expect(sync.syncedSkills).toContain("meta-skill");
    });
  });

  describe("checkSyncStatus", () => {
    it("should report stale when SKILL.md changed after sync", async () => {
      // create and sync a skill
      const skillDir = path.join(testDir, ".claude", "commands", "stale-test");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent1 = `---
name: stale-test
description: Original description
x-smart-triggers:
  activationStrategy: suggestive
  promptTriggers:
    keywords:
      - original
---

# Stale Test
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent1);
      await syncCommand({ verbose: false });

      // read config to get original checksum
      const configPath = path.join(
        testDir,
        ".claude",
        "skills",
        "skill-rules.yaml",
      );
      const config1 = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<
        string,
        unknown
      >;
      const checksum1 = (config1._sync as Record<string, unknown>)?.checksum;

      // verify initially in sync
      let status = await checkSyncStatus(testDir);
      expect(status.isStale).toBe(false);

      // modify the skill with different triggers
      const skillContent2 = `---
name: stale-test
description: Modified description
x-smart-triggers:
  activationStrategy: guaranteed
  promptTriggers:
    keywords:
      - modified
      - changed
---

# Stale Test (modified)
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent2);

      // should now be stale - the keywords and strategy changed
      status = await checkSyncStatus(testDir);

      expect(checksum1).toBeDefined();
      expect(status.isStale).toBe(true);
    });

    it("should report not stale when no changes", async () => {
      // create and sync a skill
      const skillDir = path.join(testDir, ".claude", "commands", "stable-test");
      fs.mkdirSync(skillDir, { recursive: true });

      const skillContent = `---
name: stable-test
x-smart-triggers:
  activationStrategy: native_only
---

# Stable Test
`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);
      await syncCommand({ verbose: false });

      const status = await checkSyncStatus(testDir);
      expect(status.isStale).toBe(false);
    });

    it("should handle missing config gracefully", async () => {
      const status = await checkSyncStatus(testDir);
      expect(status.isStale).toBe(false);
      expect(status.message).toContain("No skill-rules.yaml found");
    });
  });
});
