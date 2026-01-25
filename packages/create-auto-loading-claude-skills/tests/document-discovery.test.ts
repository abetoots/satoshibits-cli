import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { DocumentDiscovery } from "../src/utils/document-discovery.js";

// type for resource entries returned by checkExistingSkill
interface SkillResource {
  name: string;
  isSymlink: boolean;
  target: string | null;
}

describe("DocumentDiscovery class", () => {
  let tmpDir: string;
  let discovery: DocumentDiscovery;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync("/tmp/discovery-test-");
    discovery = new DocumentDiscovery(tmpDir);

    // create mock project documentation
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "CONTRIBUTING.md"),
      "# Contributing\n\nPlease follow our testing guidelines and use TDD approach.",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "docs/testing-strategy.md"),
      "# Testing Strategy\n\nWe use TDD, test-first development, and unit testing.",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "docs/api-design.md"),
      "# API Design\n\nREST API patterns and controller structure.",
      "utf8",
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("findExactMatches", () => {
    it("should find exact filename matches", () => {
      const matches = discovery.findExactMatches("contributing");

      expect(matches).toContain("CONTRIBUTING.md");
    });

    it("should find matches in docs directory", () => {
      const matches = discovery.findExactMatches("testing");

      expect(matches.some((m) => m.includes("testing-strategy.md"))).toBe(true);
    });

    it("should NOT return root .md files when skill name does not match", () => {
      const matches = discovery.findExactMatches("nonexistent");

      // should only return files that match the skill name
      expect(matches.length).toBe(0);
    });

    it("should be case-insensitive", () => {
      const matches = discovery.findExactMatches("CONTRIBUTING");

      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe("findKeywordMatches", () => {
    it("should find docs by keyword with confidence scoring", () => {
      const matches = discovery.findKeywordMatches(["TDD", "testing", "unit"]);

      expect(matches.length).toBeGreaterThan(0);

      // testing-strategy.md should have high confidence
      const testingDoc = matches.find((m) =>
        m.path.includes("testing-strategy"),
      );
      expect(testingDoc).toBeTruthy();
      expect(testingDoc!.confidence).toBeGreaterThan(30);
    });

    it("should sort by confidence (highest first)", () => {
      const matches = discovery.findKeywordMatches([
        "API",
        "controller",
        "REST",
      ]);

      if (matches.length > 1) {
        for (let i = 1; i < matches.length; i++) {
          expect(matches[i - 1]!.confidence).toBeGreaterThanOrEqual(
            matches[i]!.confidence,
          );
        }
      }
    });

    it("should filter out low-confidence matches (<30%)", () => {
      const matches = discovery.findKeywordMatches([
        "completely",
        "unrelated",
        "keywords",
      ]);

      // all matches should exceed 30% threshold
      matches.forEach((match) => {
        expect(match.confidence).toBeGreaterThanOrEqual(30);
      });
    });

    it("should include matched keywords in results", () => {
      const matches = discovery.findKeywordMatches(["TDD", "testing"]);

      const match = matches.find((m) => m.path.includes("testing-strategy"));
      if (match) {
        expect(match.matchedKeywords.length).toBeGreaterThan(0);
        expect(
          match.matchedKeywords.includes("TDD") ||
            match.matchedKeywords.includes("testing"),
        ).toBe(true);
      }
    });

    it("should extract keywords from description parameter", () => {
      const matches = discovery.findKeywordMatches(
        ["controller"],
        "REST API design patterns",
      );

      const apiDoc = matches.find((m) => m.path.includes("api-design"));
      expect(apiDoc).toBeTruthy();
    });

    it("should be case-insensitive for keyword matching", () => {
      const matches = discovery.findKeywordMatches(["tdd", "TESTING", "Unit"]);

      const testingDoc = matches.find((m) =>
        m.path.includes("testing-strategy"),
      );
      expect(testingDoc).toBeTruthy();
    });
  });

  describe("checkExistingSkill", () => {
    it("should detect existing skill", () => {
      // create skill
      const skillDir = path.join(tmpDir, ".claude/skills/existing-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: existing-skill\n---\n# Existing",
        "utf8",
      );

      const result = discovery.checkExistingSkill("existing-skill");

      expect(result.exists).toBe(true);
      expect(result.content).toBeTruthy();
      expect(result.content).toContain("Existing");
      expect(result.lastModified).toBeInstanceOf(Date);
    });

    it("should return exists: false for non-existent skill", () => {
      const result = discovery.checkExistingSkill("nonexistent");

      expect(result.exists).toBe(false);
      expect(result.content).toBeUndefined();
    });

    it("should detect existing resources (including symlinks)", () => {
      const skillDir = path.join(tmpDir, ".claude/skills/skill-with-resources");
      const resourcesDir = path.join(skillDir, "resources");
      fs.mkdirSync(resourcesDir, { recursive: true });

      // create regular file
      fs.writeFileSync(path.join(resourcesDir, "guide.md"), "# Guide", "utf8");

      // create symlink
      const targetFile = path.join(tmpDir, "docs/api-design.md");
      const linkPath = path.join(resourcesDir, "api-design.md");
      try {
        fs.symlinkSync(path.relative(resourcesDir, targetFile), linkPath);
      } catch (error: unknown) {
        // windows might not support symlinks - skip this part of the test
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "EPERM") {
          console.warn("⚠️  Symlink test skipped (Windows permissions)");
          fs.writeFileSync(
            path.join(skillDir, "SKILL.md"),
            "---\nname: test\n---",
            "utf8",
          );
          const result = discovery.checkExistingSkill("skill-with-resources");
          expect(result.resources).toBeTruthy();
          expect(result.resources!.length).toBeGreaterThanOrEqual(1);
          return;
        }
        throw error;
      }

      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: test\n---",
        "utf8",
      );

      const result = discovery.checkExistingSkill("skill-with-resources");

      expect(result.resources).toBeTruthy();
      expect(result.resources!.length).toBe(2);

      const symlink = (result.resources as SkillResource[]).find(
        (r) => r.isSymlink,
      );
      expect(symlink).toBeTruthy();
      expect(symlink!.target).toBeTruthy();
    });

    it("should return empty resources array when no resources directory", () => {
      const skillDir = path.join(tmpDir, ".claude/skills/no-resources");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "---\nname: no-resources\n---\n# Test",
        "utf8",
      );

      const result = discovery.checkExistingSkill("no-resources");

      expect(result.exists).toBe(true);
      expect(result.resources).toBeTruthy();
      expect(result.resources!.length).toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty keywords array", () => {
      const matches = discovery.findKeywordMatches([]);

      // should return only high-confidence matches or empty array
      expect(Array.isArray(matches)).toBe(true);
    });

    it("should handle special characters in skill names", () => {
      const matches = discovery.findExactMatches("test-skill-name");

      expect(Array.isArray(matches)).toBe(true);
    });

    it("should handle nested documentation directories", () => {
      // create nested docs
      const nestedDir = path.join(tmpDir, "docs/guides/advanced");
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(
        path.join(nestedDir, "advanced-testing.md"),
        "# Advanced Testing\n\nAdvanced TDD techniques.",
        "utf8",
      );

      const matches = discovery.findKeywordMatches([
        "Advanced",
        "TDD",
        "techniques",
      ]);

      const advancedDoc = matches.find((m) =>
        m.path.includes("advanced-testing"),
      );
      expect(advancedDoc).toBeTruthy();
    });

    it("should return empty array when no docs exist at all", () => {
      // create a new empty project directory
      const emptyDir = fs.mkdtempSync("/tmp/empty-discovery-test-");
      const emptyDiscovery = new DocumentDiscovery(emptyDir);

      try {
        // no root .md files, no docs/ directory
        const exactMatches = emptyDiscovery.findExactMatches("anything");
        const keywordMatches = emptyDiscovery.findKeywordMatches([
          "test",
          "api",
        ]);

        // should return empty arrays when truly no docs exist
        expect(Array.isArray(exactMatches)).toBe(true);
        expect(Array.isArray(keywordMatches)).toBe(true);
        expect(exactMatches.length).toBe(0);
        expect(keywordMatches.length).toBe(0);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
