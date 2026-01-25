/**
 * Template Validation Tests
 *
 * Ensures all shipped templates are valid and follow best practices.
 * This test suite catches issues before templates are released to users.
 */

import fs from "fs";
import path from "path";

// templates directory - relative to tests/validation/
const TEMPLATES_DIR = path.join(
  import.meta.dirname,
  "../../src/templates/skills",
);

interface TemplateManifest {
  version: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  variables?: Record<string, string>;
  skillRule: {
    type: string;
    enforcement: string;
    priority: string;
    description: string;
    promptTriggers?: {
      keywords?: string[];
      intentPatterns?: string[];
    };
    fileTriggers?: {
      pathPatterns?: string[];
      contentPatterns?: string[];
    };
    validationRules?: {
      name: string;
      condition: { pattern: string };
      requirement: { pattern: string };
      reminder: string;
    }[];
  };
}

/**
 * Get all template directories
 */
function getTemplateDirs(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(TEMPLATES_DIR, dirent.name));
}

/**
 * Load and parse template manifest
 */
function loadManifest(templateDir: string): TemplateManifest {
  const manifestPath = path.join(templateDir, "template.json");
  const content = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(content) as TemplateManifest;
}

describe("Template Validation", () => {
  const templateDirs = getTemplateDirs();

  it("should have at least one template", () => {
    expect(templateDirs.length).toBeGreaterThan(0);
  });

  for (const templateDir of templateDirs) {
    const templateName = path.basename(templateDir);

    describe(`Template: ${templateName}`, () => {
      it("should have valid template.json", () => {
        const manifestPath = path.join(templateDir, "template.json");
        expect(fs.existsSync(manifestPath)).toBe(true);

        // Should parse without errors and return an object
        const manifest = loadManifest(templateDir);
        expect(typeof manifest).toBe("object");
        expect(manifest).not.toBeNull();
      });

      it("should have required fields in manifest", () => {
        const manifest = loadManifest(templateDir);

        // Required top-level fields - verify non-empty strings
        expect(typeof manifest.version).toBe("string");
        expect(manifest.version.length).toBeGreaterThan(0);
        expect(typeof manifest.name).toBe("string");
        expect(manifest.name.length).toBeGreaterThan(0);
        expect(typeof manifest.displayName).toBe("string");
        expect(manifest.displayName.length).toBeGreaterThan(0);
        expect(typeof manifest.description).toBe("string");
        expect(manifest.description.length).toBeGreaterThan(0);
        expect(typeof manifest.category).toBe("string");
        expect(manifest.category.length).toBeGreaterThan(0);
        expect(Array.isArray(manifest.tags)).toBe(true);
        expect(typeof manifest.author).toBe("string");
        expect(manifest.author.length).toBeGreaterThan(0);

        // Required skillRule fields - verify object and non-empty strings
        expect(typeof manifest.skillRule).toBe("object");
        expect(manifest.skillRule).not.toBeNull();
        expect(typeof manifest.skillRule.type).toBe("string");
        expect(manifest.skillRule.type.length).toBeGreaterThan(0);
        expect(typeof manifest.skillRule.enforcement).toBe("string");
        expect(manifest.skillRule.enforcement.length).toBeGreaterThan(0);
        expect(typeof manifest.skillRule.priority).toBe("string");
        expect(manifest.skillRule.priority.length).toBeGreaterThan(0);
        expect(typeof manifest.skillRule.description).toBe("string");
        expect(manifest.skillRule.description.length).toBeGreaterThan(0);
      });

      it("should have valid enum values", () => {
        const manifest = loadManifest(templateDir);

        // Valid categories
        const validCategories = [
          "development",
          "quality",
          "security",
          "documentation",
          "other",
        ];
        expect(validCategories.includes(manifest.category)).toBe(true);

        // Valid skill rule type
        const validTypes = ["domain", "guardrail"];
        expect(validTypes.includes(manifest.skillRule.type)).toBe(true);

        // Valid enforcement
        const validEnforcement = ["suggest", "warn", "block"];
        expect(validEnforcement.includes(manifest.skillRule.enforcement)).toBe(
          true,
        );

        // Valid priority
        const validPriorities = ["low", "medium", "high"];
        expect(validPriorities.includes(manifest.skillRule.priority)).toBe(
          true,
        );
      });

      it("should have at least one activation trigger", () => {
        const manifest = loadManifest(templateDir);

        const hasPromptTriggers =
          (manifest.skillRule.promptTriggers?.keywords?.length ?? 0) > 0 ||
          (manifest.skillRule.promptTriggers?.intentPatterns?.length ?? 0) > 0;

        const hasFileTriggers =
          (manifest.skillRule.fileTriggers?.pathPatterns?.length ?? 0) > 0 ||
          (manifest.skillRule.fileTriggers?.contentPatterns?.length ?? 0) > 0;

        expect(hasPromptTriggers || hasFileTriggers).toBe(true);
      });

      it("should have valid regex patterns", () => {
        const manifest = loadManifest(templateDir);

        // Test intent patterns
        if (manifest.skillRule.promptTriggers?.intentPatterns) {
          for (const pattern of manifest.skillRule.promptTriggers
            .intentPatterns) {
            expect(() => new RegExp(pattern)).not.toThrow();
          }
        }

        // Test file content patterns
        if (manifest.skillRule.fileTriggers?.contentPatterns) {
          for (const pattern of manifest.skillRule.fileTriggers
            .contentPatterns) {
            expect(() => new RegExp(pattern)).not.toThrow();
          }
        }

        // Test validation rule patterns
        if (manifest.skillRule.validationRules) {
          for (const rule of manifest.skillRule.validationRules) {
            expect(() => new RegExp(rule.condition.pattern)).not.toThrow();
            expect(() => new RegExp(rule.requirement.pattern)).not.toThrow();
          }
        }
      });

      it("should have SKILL.md file", () => {
        const skillPath = path.join(templateDir, "SKILL.md");
        expect(fs.existsSync(skillPath)).toBe(true);
      });

      it("should have SKILL.md under 500 lines (recommended)", () => {
        const skillPath = path.join(templateDir, "SKILL.md");
        const content = fs.readFileSync(skillPath, "utf8");
        const lineCount = content.split("\n").length;

        // Warning, not failure - 500 line rule is a guideline
        if (lineCount > 500) {
          console.warn(
            `⚠️  ${templateName}: SKILL.md has ${lineCount} lines (recommended: ≤500)`,
          );
        }

        // Hard limit at 1000 lines
        expect(lineCount <= 1000).toBe(true);
      });

      it("should have valid frontmatter in SKILL.md", () => {
        const skillPath = path.join(templateDir, "SKILL.md");
        const content = fs.readFileSync(skillPath, "utf8");

        // Check for frontmatter (regex returns null if no match)
        const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
        expect(frontmatterMatch).not.toBeNull();

        const frontmatter = frontmatterMatch![1]!;

        // Check required frontmatter fields
        expect(/^name:/m.test(frontmatter)).toBe(true);
        expect(/^description:/m.test(frontmatter)).toBe(true);
        expect(/^allowed-tools:/m.test(frontmatter)).toBe(true);
      });

      it("should have no unsubstituted variables in SKILL.md template", () => {
        const skillPath = path.join(templateDir, "SKILL.md");
        const content = fs.readFileSync(skillPath, "utf8");
        const manifest = loadManifest(templateDir);

        // Find all {{VARIABLE}} patterns
        const variablePattern = /\{\{([A-Z_]+)\}\}/g;
        const foundVariables = new Set<string>();
        let match;

        while ((match = variablePattern.exec(content)) !== null) {
          foundVariables.add(match[1]!);
        }

        // All found variables should be declared in manifest
        if (manifest.variables) {
          for (const variable of foundVariables) {
            expect(variable in manifest.variables).toBe(true);
          }
        } else if (foundVariables.size > 0) {
          expect.fail(
            `SKILL.md uses variables (${Array.from(foundVariables).join(", ")}) but template.json has no variables field`,
          );
        }
      });

      it("should have consistent name between manifest and SKILL.md", () => {
        const manifest = loadManifest(templateDir);
        const skillPath = path.join(templateDir, "SKILL.md");
        const content = fs.readFileSync(skillPath, "utf8");

        const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
        expect(frontmatterMatch).not.toBeNull();

        const nameMatch = /^name:\s*(.+)$/m.exec(frontmatterMatch![1]!);
        expect(nameMatch).not.toBeNull();

        const skillName = nameMatch![1]!.trim();
        expect(skillName).toBe(manifest.name);
      });

      it("should have keywords in manifest if specified", () => {
        const manifest = loadManifest(templateDir);

        if (manifest.skillRule.promptTriggers?.keywords) {
          expect(manifest.skillRule.promptTriggers.keywords.length > 0).toBe(
            true,
          );

          // Keywords should be reasonable length
          for (const keyword of manifest.skillRule.promptTriggers.keywords) {
            expect(keyword.length >= 2 && keyword.length <= 50).toBe(true);
          }
        }
      });

      it("should have validation rules with all required fields", () => {
        const manifest = loadManifest(templateDir);

        if (manifest.skillRule.validationRules) {
          for (const rule of manifest.skillRule.validationRules) {
            // verify required string fields
            expect(typeof rule.name).toBe("string");
            expect(rule.name.length).toBeGreaterThan(0);

            // verify condition object and pattern
            expect(typeof rule.condition).toBe("object");
            expect(rule.condition).not.toBeNull();
            expect(typeof rule.condition.pattern).toBe("string");
            expect(rule.condition.pattern.length).toBeGreaterThan(0);

            // verify requirement object and pattern
            expect(typeof rule.requirement).toBe("object");
            expect(rule.requirement).not.toBeNull();
            expect(typeof rule.requirement.pattern).toBe("string");
            expect(rule.requirement.pattern.length).toBeGreaterThan(0);

            // verify reminder is a helpful message (non-empty, minimum length)
            expect(typeof rule.reminder).toBe("string");
            expect(rule.reminder.length).toBeGreaterThanOrEqual(10);
          }
        }
      });

      it("should not have resources/ directory (feature not implemented yet)", () => {
        const resourcesPath = path.join(templateDir, "resources");
        // resources/ directory support is not yet implemented in the catalog
        // templates should not include resources/ until the feature is ready
        expect(
          fs.existsSync(resourcesPath),
          `${templateName} has resources/ directory but feature is not implemented yet`,
        ).toBe(false);
      });
    });
  }
});

describe("Template Catalog Integration", () => {
  it("should be able to load all templates", () => {
    const templateDirs = getTemplateDirs();

    for (const templateDir of templateDirs) {
      const manifest = loadManifest(templateDir);
      const skillPath = path.join(templateDir, "SKILL.md");
      const skillContent = fs.readFileSync(skillPath, "utf8");

      // verify manifest is a valid object
      expect(typeof manifest).toBe("object");
      expect(manifest).not.toBeNull();

      // verify skill content exists and has frontmatter structure
      expect(skillContent.length).toBeGreaterThan(0);
      expect(skillContent).toMatch(/^---/);
    }
  });

  it("should have unique template names", () => {
    const templateDirs = getTemplateDirs();
    const names = new Set<string>();

    for (const templateDir of templateDirs) {
      const manifest = loadManifest(templateDir);
      expect(names.has(manifest.name)).toBe(false);
      names.add(manifest.name);
    }
  });

  it("should have display names matching conventions", () => {
    const templateDirs = getTemplateDirs();

    for (const templateDir of templateDirs) {
      const manifest = loadManifest(templateDir);

      // Display name should be title case and descriptive
      expect(manifest.displayName.length >= 10).toBe(true);

      // Should not be all lowercase
      expect(manifest.displayName !== manifest.displayName.toLowerCase()).toBe(
        true,
      );
    }
  });
});
