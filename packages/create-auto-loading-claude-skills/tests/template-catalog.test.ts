/**
 * Template Catalog Unit Tests
 *
 * Tests template loading, variable substitution, and installation logic.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { TemplateCatalog } from "../src/utils/template-catalog.js";

// test fixtures - relative to tests/ directory
const TEST_FIXTURES_DIR = path.join(
  import.meta.dirname,
  "../__tests__/fixtures/templates",
);
// production templates - relative to tests/ directory
const PRODUCTION_TEMPLATES_DIR = path.join(
  import.meta.dirname,
  "../src/templates/skills",
);

/**
 * Create minimal test template
 */
function createTestTemplate(
  name: string,
  options: {
    withVariables?: boolean;
    withSkillContent?: string;
  } = {},
) {
  const templateDir = path.join(TEST_FIXTURES_DIR, name);
  fs.mkdirSync(templateDir, { recursive: true });

  // create manifest
  const manifest = {
    version: "1.0",
    name,
    displayName: `Test ${name}`,
    description: "Test template",
    category: "development",
    tags: ["test"],
    author: "test",
    ...(options.withVariables && {
      variables: {
        PROJECT_NAME: "MyProject",
        FRAMEWORK: "Express",
      },
    }),
    skillRule: {
      type: "domain",
      enforcement: "suggest",
      priority: "medium",
      description: "Test skill",
      promptTriggers: {
        keywords: ["test"],
      },
    },
  };

  fs.writeFileSync(
    path.join(templateDir, "template.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  // create SKILL.md
  const skillContent =
    options.withSkillContent ??
    `---
name: ${name}
description: Test skill
allowed-tools: Read,Write
---

# Test Skill

${options.withVariables ? "Project: {{PROJECT_NAME}}" : "No variables"}
${options.withVariables ? "Framework: {{FRAMEWORK}}" : ""}
`;

  fs.writeFileSync(path.join(templateDir, "SKILL.md"), skillContent, "utf8");
}

/**
 * Cleanup test fixtures
 */
function cleanupFixtures() {
  if (fs.existsSync(TEST_FIXTURES_DIR)) {
    fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
  }
}

describe("TemplateCatalog", () => {
  beforeEach(() => {
    cleanupFixtures();
    fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupFixtures();
  });

  describe("loadAll()", () => {
    it("should return empty array when no templates exist", () => {
      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const templates = catalog.loadAll();
      expect(templates.length).toBe(0);
    });

    it("should load all valid templates", () => {
      createTestTemplate("template-1");
      createTestTemplate("template-2");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const templates = catalog.loadAll();

      expect(templates.length).toBe(2);
      expect(templates.some((t) => t.manifest.name === "template-1")).toBe(true);
      expect(templates.some((t) => t.manifest.name === "template-2")).toBe(true);
    });

    it("should skip directories without template.json", () => {
      createTestTemplate("valid-template");

      // create invalid template (no template.json)
      const invalidDir = path.join(TEST_FIXTURES_DIR, "invalid-template");
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.writeFileSync(path.join(invalidDir, "SKILL.md"), "# Invalid", "utf8");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const templates = catalog.loadAll();

      expect(templates.length).toBe(1);
      expect(templates[0]!.manifest.name).toBe("valid-template");
    });

    it("should skip templates with invalid JSON", () => {
      createTestTemplate("valid-template");

      // create template with invalid JSON
      const invalidDir = path.join(TEST_FIXTURES_DIR, "invalid-json");
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.writeFileSync(
        path.join(invalidDir, "template.json"),
        "{ invalid json }",
        "utf8",
      );

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const templates = catalog.loadAll();

      expect(templates.length).toBe(1);
      expect(templates[0]!.manifest.name).toBe("valid-template");
    });
  });

  describe("load()", () => {
    it("should load template by name", () => {
      createTestTemplate("my-template");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("my-template");

      expect(template).toBeTruthy();
      expect(template!.manifest.name).toBe("my-template");
      expect(template!.skillContent).toContain("Test Skill");
    });

    it("should return null for non-existent template", () => {
      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("non-existent");

      expect(template).toBeNull();
    });

    it("should load template with variables", () => {
      createTestTemplate("template-with-vars", { withVariables: true });

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("template-with-vars");

      expect(template).toBeTruthy();
      expect(template!.manifest.variables).toBeTruthy();
      expect(template!.manifest.variables!.PROJECT_NAME).toBe("MyProject");
    });
  });

  describe("install()", () => {
    it("should install template without variables", () => {
      createTestTemplate("simple-template");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("simple-template")!;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output");
      fs.mkdirSync(outputDir, { recursive: true });

      const result = catalog.install(template, outputDir, {});

      expect(result).toBeTruthy();
      expect(fs.existsSync(result.skillPath)).toBe(true);

      const installedContent = fs.readFileSync(result.skillPath, "utf8");
      expect(installedContent).toContain("No variables");
    });

    it("should substitute variables in SKILL.md", () => {
      createTestTemplate("template-with-vars", {
        withVariables: true,
        withSkillContent: `---
name: template-with-vars
description: Test
allowed-tools: Read
---

# {{PROJECT_NAME}} Guide

Using {{FRAMEWORK}} for backend.
`,
      });

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("template-with-vars")!;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output");
      fs.mkdirSync(outputDir, { recursive: true });

      const result = catalog.install(template, outputDir, {
        PROJECT_NAME: "TestApp",
        FRAMEWORK: "Fastify",
      });

      const installedContent = fs.readFileSync(result.skillPath, "utf8");

      expect(installedContent).toContain("TestApp Guide");
      expect(installedContent).toContain("Using Fastify for backend");
      expect(installedContent).not.toContain("{{PROJECT_NAME}}");
      expect(installedContent).not.toContain("{{FRAMEWORK}}");
    });

    it("should handle templates with no variables field gracefully", () => {
      // this tests the bug fix: ...(template.manifest.variables || {})
      createTestTemplate("no-vars-field");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("no-vars-field")!;

      // remove variables field to simulate optional field
      delete template.manifest.variables;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output");
      fs.mkdirSync(outputDir, { recursive: true });

      // should not throw TypeError
      expect(() => {
        catalog.install(template, outputDir, {});
      }).not.toThrow();
    });

    it("should use default values for unspecified variables", () => {
      createTestTemplate("template-with-defaults", {
        withVariables: true,
        withSkillContent: `---
name: template-with-defaults
description: Test
allowed-tools: Read
---

Project: {{PROJECT_NAME}}
Framework: {{FRAMEWORK}}
`,
      });

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("template-with-defaults")!;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output");
      fs.mkdirSync(outputDir, { recursive: true });

      // only provide one variable, use default for the other
      const result = catalog.install(template, outputDir, {
        PROJECT_NAME: "CustomProject",
        // FRAMEWORK should use default 'Express'
      });

      const installedContent = fs.readFileSync(result.skillPath, "utf8");

      expect(installedContent).toContain("CustomProject");
      expect(installedContent).toContain("Express"); // default value
    });

    it("should create skill directory if it does not exist", () => {
      createTestTemplate("test-template");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("test-template")!;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output/nested/path");
      // don't create the directory - install should create it

      const result = catalog.install(template, outputDir, {});

      expect(fs.existsSync(result.skillPath)).toBe(true);
      expect(fs.existsSync(path.dirname(result.skillPath))).toBe(true);
    });

    it("should return correct skill path", () => {
      createTestTemplate("path-test");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("path-test")!;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output");
      fs.mkdirSync(outputDir, { recursive: true });

      const result = catalog.install(template, outputDir, {});

      const expectedPath = path.join(
        outputDir,
        ".claude",
        "skills",
        "path-test",
        "SKILL.md",
      );
      expect(result.skillPath).toBe(expectedPath);
      expect(fs.existsSync(expectedPath)).toBe(true);
    });

    it("should copy resources directory if it exists", () => {
      // create template with resources
      createTestTemplate("template-with-resources");
      const templateDir = path.join(
        TEST_FIXTURES_DIR,
        "template-with-resources",
      );
      const resourcesDir = path.join(templateDir, "resources");
      fs.mkdirSync(resourcesDir, { recursive: true });

      // add resource files
      fs.writeFileSync(
        path.join(resourcesDir, "example.md"),
        "# Example Resource\nThis is a template resource file.",
        "utf8",
      );
      fs.writeFileSync(
        path.join(resourcesDir, "config.json"),
        JSON.stringify({ setting: "value" }, null, 2),
        "utf8",
      );

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const template = catalog.load("template-with-resources")!;

      const outputDir = path.join(TEST_FIXTURES_DIR, "output");
      fs.mkdirSync(outputDir, { recursive: true });

      catalog.install(template, outputDir, {});

      // verify resources were copied
      const targetResourcesDir = path.join(
        outputDir,
        ".claude",
        "skills",
        "template-with-resources",
        "resources",
      );

      expect(fs.existsSync(targetResourcesDir)).toBe(true);
      expect(fs.existsSync(path.join(targetResourcesDir, "example.md"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(targetResourcesDir, "config.json"))).toBe(
        true,
      );

      // verify content is correct
      const exampleContent = fs.readFileSync(
        path.join(targetResourcesDir, "example.md"),
        "utf8",
      );
      expect(exampleContent).toContain("Example Resource");
    });
  });

  describe("count()", () => {
    it("should return 0 when no templates exist", () => {
      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      expect(catalog.count()).toBe(0);
    });

    it("should return correct count", () => {
      createTestTemplate("template-1");
      createTestTemplate("template-2");
      createTestTemplate("template-3");

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      expect(catalog.count()).toBe(3);
    });
  });

  describe("groupByCategory()", () => {
    it("should group templates by category", () => {
      // create templates in different categories
      createTestTemplate("dev-template");
      const qualityTemplate = path.join(TEST_FIXTURES_DIR, "quality-template");
      fs.mkdirSync(qualityTemplate, { recursive: true });

      fs.writeFileSync(
        path.join(qualityTemplate, "template.json"),
        JSON.stringify(
          {
            version: "1.0",
            name: "quality-template",
            displayName: "Quality Template",
            description: "Test",
            category: "quality",
            tags: ["test"],
            author: "test",
            skillRule: {
              type: "domain",
              enforcement: "suggest",
              priority: "medium",
              description: "Test",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      fs.writeFileSync(
        path.join(qualityTemplate, "SKILL.md"),
        "---\nname: quality-template\ndescription: Test\nallowed-tools: Read\n---\n\n# Test",
        "utf8",
      );

      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const grouped = catalog.groupByCategory();

      expect(grouped).toBeInstanceOf(Map);
      expect(grouped.has("development")).toBe(true);
      expect(grouped.has("quality")).toBe(true);
      expect(grouped.get("development")?.length).toBe(1);
      expect(grouped.get("quality")?.length).toBe(1);
    });

    it("should handle empty catalog", () => {
      const catalog = new TemplateCatalog(TEST_FIXTURES_DIR);
      const grouped = catalog.groupByCategory();

      expect(grouped).toBeInstanceOf(Map);
      expect(grouped.size).toBe(0);
    });
  });

  describe("Production templates", () => {
    it("should load and install backend-dev-guidelines with variable substitution", () => {
      const catalog = new TemplateCatalog(PRODUCTION_TEMPLATES_DIR);
      const template = catalog.load("backend-dev-guidelines");

      expect(template).toBeTruthy();
      expect(template!.manifest.variables).toBeTruthy();

      // verify expected production variables exist
      expect(template!.manifest.variables!.BACKEND_FRAMEWORK).toBeTruthy();
      expect(template!.manifest.variables!.DATABASE_ORM).toBeTruthy();
      expect(template!.manifest.variables!.ERROR_TRACKER).toBeTruthy();

      // install with custom variables
      const outputDir = path.join(TEST_FIXTURES_DIR, "prod-output");
      fs.mkdirSync(outputDir, { recursive: true });

      const result = catalog.install(template!, outputDir, {
        BACKEND_FRAMEWORK: "Fastify",
        DATABASE_ORM: "Drizzle",
        ERROR_TRACKER: "Datadog",
      });

      const installedContent = fs.readFileSync(result.skillPath, "utf8");

      // verify substitutions happened
      expect(installedContent).toContain("Fastify");
      expect(installedContent).toContain("Drizzle");
      expect(installedContent).toContain("Datadog");

      // verify no unsubstituted placeholders remain
      expect(installedContent).not.toContain("{{BACKEND_FRAMEWORK}}");
      expect(installedContent).not.toContain("{{DATABASE_ORM}}");
      expect(installedContent).not.toContain("{{ERROR_TRACKER}}");
    });

    it("should use default values for production template variables", () => {
      const catalog = new TemplateCatalog(PRODUCTION_TEMPLATES_DIR);
      const template = catalog.load("backend-dev-guidelines");

      expect(template).toBeTruthy();

      const outputDir = path.join(TEST_FIXTURES_DIR, "prod-defaults");
      fs.mkdirSync(outputDir, { recursive: true });

      // install without providing variables - should use defaults
      const result = catalog.install(template!, outputDir, {});

      const installedContent = fs.readFileSync(result.skillPath, "utf8");

      // verify defaults were used (from template.json)
      expect(installedContent).toContain("Express");
      expect(installedContent).toContain("Prisma");
      expect(installedContent).toContain("Sentry");
    });

    it("should load all production templates successfully", () => {
      const catalog = new TemplateCatalog(PRODUCTION_TEMPLATES_DIR);
      const templates = catalog.loadAll();

      // verify expected templates exist
      const templateNames = templates.map((t) => t.manifest.name);
      expect(templateNames).toContain("backend-dev-guidelines");
      expect(templateNames).toContain("frontend-dev-guidelines");
      expect(templateNames).toContain("error-handling");

      // verify all templates have required fields
      for (const template of templates) {
        expect(template.manifest.name).toBeTruthy();
        expect(template.manifest.displayName).toBeTruthy();
        expect(template.manifest.skillRule).toBeTruthy();
      }
    });
  });
});
