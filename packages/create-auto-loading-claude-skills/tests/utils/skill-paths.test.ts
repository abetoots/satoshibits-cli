import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveSkillFile, skillExists } from "../../src/utils/skill-paths.js";

describe("skillExists (shared SSOT predicate for sync + validate)", () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-paths-"));
  });

  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  function makeSkill(name: string, file: string): void {
    fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, name, file), "# skill");
  }

  it("is true when SKILL.md exists", () => {
    makeSkill("alpha", "SKILL.md");
    expect(skillExists(skillsDir, "alpha")).toBe(true);
  });

  it("is true when the lowercase skill.md exists", () => {
    // sync discovers with a case-insensitive glob, so this must count as present —
    // otherwise a synced lowercase skill is reported orphaned and dropped as stale
    makeSkill("beta", "skill.md");
    expect(skillExists(skillsDir, "beta")).toBe(true);
  });

  it("is false when the directory exists but has no SKILL.md", () => {
    fs.mkdirSync(path.join(skillsDir, "gamma"), { recursive: true });
    expect(skillExists(skillsDir, "gamma")).toBe(false);
  });

  it("is false for a name that does not exist", () => {
    expect(skillExists(skillsDir, "nope")).toBe(false);
  });
});

describe("resolveSkillFile", () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-skill-"));
  });

  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  it("returns the uppercase path when SKILL.md exists", () => {
    fs.mkdirSync(path.join(skillsDir, "a"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "a", "SKILL.md"), "x");
    expect(resolveSkillFile(skillsDir, "a")).toBe(
      path.join(skillsDir, "a", "SKILL.md"),
    );
  });

  it("returns the lowercase path when only skill.md exists", () => {
    fs.mkdirSync(path.join(skillsDir, "b"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "b", "skill.md"), "x");
    expect(resolveSkillFile(skillsDir, "b")).toBe(
      path.join(skillsDir, "b", "skill.md"),
    );
  });

  it("returns null when neither exists", () => {
    fs.mkdirSync(path.join(skillsDir, "c"), { recursive: true });
    expect(resolveSkillFile(skillsDir, "c")).toBeNull();
  });
});
