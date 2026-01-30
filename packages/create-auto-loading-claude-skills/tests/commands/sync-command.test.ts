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
  let fakeHomeDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // create temp directories for project and fake home
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-home-"));
    originalCwd = process.cwd();
    process.chdir(testDir);

    // mock os.homedir() to use fake home directory
    vi.spyOn(os, "homedir").mockReturnValue(fakeHomeDir);

    // suppress console output during tests
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
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

  describe("personal scope skill discovery", () => {
    it("should discover skills from personal scope (~/.claude/skills/)", async () => {
      // create personal skill
      const personalSkillDir = path.join(fakeHomeDir, ".claude", "skills", "personal-tool");
      fs.mkdirSync(personalSkillDir, { recursive: true });

      const personalSkillContent = `---
name: personal-tool
description: A personal tool skill
x-smart-triggers:
  activationStrategy: suggestive
  promptTriggers:
    keywords:
      - personal
---

# Personal Tool
`;

      fs.writeFileSync(path.join(personalSkillDir, "SKILL.md"), personalSkillContent);

      await syncCommand({ verbose: false });

      // check that personal skill was synced
      const configPath = path.join(testDir, ".claude", "skills", "skill-rules.yaml");
      expect(fs.existsSync(configPath)).toBe(true);

      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const skills = config.skills as Record<string, unknown>;

      expect(skills["personal-tool"]).toBeDefined();

      // check sync metadata tracks scope
      const sync = config._sync as Record<string, unknown>;
      expect(sync.skillScopes).toBeDefined();
      expect((sync.skillScopes as Record<string, string>)["personal-tool"]).toBe("personal");
    });

    it("should have project skills override personal skills with same name", async () => {
      // create personal skill
      const personalSkillDir = path.join(fakeHomeDir, ".claude", "skills", "override-test");
      fs.mkdirSync(personalSkillDir, { recursive: true });

      const personalSkillContent = `---
name: override-test
description: Personal version
x-smart-triggers:
  activationStrategy: suggestive
  promptTriggers:
    keywords:
      - personal-keyword
---

# Personal Override Test
`;

      fs.writeFileSync(path.join(personalSkillDir, "SKILL.md"), personalSkillContent);

      // create project skill with same name
      const projectSkillDir = path.join(testDir, ".claude", "commands", "override-test");
      fs.mkdirSync(projectSkillDir, { recursive: true });

      const projectSkillContent = `---
name: override-test
description: Project version
x-smart-triggers:
  activationStrategy: guaranteed
  promptTriggers:
    keywords:
      - project-keyword
---

# Project Override Test
`;

      fs.writeFileSync(path.join(projectSkillDir, "SKILL.md"), projectSkillContent);

      await syncCommand({ verbose: false });

      // check that project version was used
      const configPath = path.join(testDir, ".claude", "skills", "skill-rules.yaml");
      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const skills = config.skills as Record<string, Record<string, unknown>>;

      expect(skills["override-test"]).toBeDefined();
      // project uses "guaranteed", personal uses "suggestive"
      expect(skills["override-test"]!.activationStrategy).toBe("guaranteed");
      // project has "project-keyword", personal has "personal-keyword"
      expect((skills["override-test"]!.promptTriggers as Record<string, string[]>).keywords).toContain("project-keyword");
      expect((skills["override-test"]!.promptTriggers as Record<string, string[]>).keywords).not.toContain("personal-keyword");

      // check scope is tracked as project
      const sync = config._sync as Record<string, unknown>;
      expect((sync.skillScopes as Record<string, string>)["override-test"]).toBe("project");
    });

    it("should sync skills from both scopes when names are different", async () => {
      // create personal skill
      const personalSkillDir = path.join(fakeHomeDir, ".claude", "skills", "personal-only");
      fs.mkdirSync(personalSkillDir, { recursive: true });

      const personalSkillContent = `---
name: personal-only
x-smart-triggers:
  activationStrategy: suggestive
---

# Personal Only
`;

      fs.writeFileSync(path.join(personalSkillDir, "SKILL.md"), personalSkillContent);

      // create project skill with different name
      const projectSkillDir = path.join(testDir, ".claude", "commands", "project-only");
      fs.mkdirSync(projectSkillDir, { recursive: true });

      const projectSkillContent = `---
name: project-only
x-smart-triggers:
  activationStrategy: guaranteed
---

# Project Only
`;

      fs.writeFileSync(path.join(projectSkillDir, "SKILL.md"), projectSkillContent);

      await syncCommand({ verbose: false });

      // check that both skills were synced
      const configPath = path.join(testDir, ".claude", "skills", "skill-rules.yaml");
      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const skills = config.skills as Record<string, unknown>;

      expect(skills["personal-only"]).toBeDefined();
      expect(skills["project-only"]).toBeDefined();

      // check scopes are tracked correctly
      const sync = config._sync as Record<string, unknown>;
      const scopes = sync.skillScopes as Record<string, string>;
      expect(scopes["personal-only"]).toBe("personal");
      expect(scopes["project-only"]).toBe("project");
    });

    it("should handle empty personal skills directory gracefully", async () => {
      // create empty personal skills directory
      const personalDir = path.join(fakeHomeDir, ".claude", "skills");
      fs.mkdirSync(personalDir, { recursive: true });

      // create project skill
      const projectSkillDir = path.join(testDir, ".claude", "commands", "project-skill");
      fs.mkdirSync(projectSkillDir, { recursive: true });

      const projectSkillContent = `---
name: project-skill
x-smart-triggers:
  activationStrategy: suggestive
---

# Project Skill
`;

      fs.writeFileSync(path.join(projectSkillDir, "SKILL.md"), projectSkillContent);

      await syncCommand({ verbose: false });

      // should work without errors and sync project skill
      const configPath = path.join(testDir, ".claude", "skills", "skill-rules.yaml");
      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const skills = config.skills as Record<string, unknown>;

      expect(skills["project-skill"]).toBeDefined();
    });

    it("should handle non-existent personal skills directory gracefully", async () => {
      // don't create any personal directory - it shouldn't exist

      // create project skill
      const projectSkillDir = path.join(testDir, ".claude", "commands", "project-skill");
      fs.mkdirSync(projectSkillDir, { recursive: true });

      const projectSkillContent = `---
name: project-skill
x-smart-triggers:
  activationStrategy: suggestive
---

# Project Skill
`;

      fs.writeFileSync(path.join(projectSkillDir, "SKILL.md"), projectSkillContent);

      await syncCommand({ verbose: false });

      // should work without errors
      const configPath = path.join(testDir, ".claude", "skills", "skill-rules.yaml");
      const config = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const skills = config.skills as Record<string, unknown>;

      expect(skills["project-skill"]).toBeDefined();
    });
  });
});
