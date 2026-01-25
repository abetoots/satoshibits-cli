import fs from "fs";
import path from "path";

import type { SkillRule } from "@satoshibits/claude-skill-runtime";

export interface TemplateManifest {
  version: string;
  name: string;
  displayName: string;
  description: string;
  category: "development" | "testing" | "documentation" | "quality" | "custom";
  tags: string[];
  author?: string;
  variables?: Record<string, string>;
  skillRule: SkillRule;
}

export interface TemplateInfo {
  manifest: TemplateManifest;
  templateDir: string;
  skillContent: string;
}

/**
 * Manages template catalog loading and installation
 */
export class TemplateCatalog {
  private templatesDir: string;

  constructor(templatesDir?: string) {
    // templates are in src/templates/skills/ (relative to this file in src/utils/)
    // allow override for testing
    this.templatesDir =
      templatesDir ?? path.join(import.meta.dirname, "../templates/skills");
  }

  /**
   * Load all available templates
   */
  loadAll(): TemplateInfo[] {
    if (!fs.existsSync(this.templatesDir)) {
      return [];
    }

    const templates: TemplateInfo[] = [];
    const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const templateDir = path.join(this.templatesDir, entry.name);
      const manifestPath = path.join(templateDir, "template.json");
      const skillPath = path.join(templateDir, "SKILL.md");

      // skip if missing required files
      if (!fs.existsSync(manifestPath) || !fs.existsSync(skillPath)) {
        if (process.env.DEBUG) {
          console.warn(
            `Template '${entry.name}' missing required files, skipping`,
          );
        }
        continue;
      }

      try {
        const manifestContent = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(manifestContent) as TemplateManifest;

        const skillContent = fs.readFileSync(skillPath, "utf8");

        templates.push({
          manifest,
          templateDir,
          skillContent,
        });
      } catch (_error) {
        if (process.env.DEBUG) {
          console.warn(`Failed to load template '${entry.name}':`, _error);
        }
        continue;
      }
    }

    return templates;
  }

  /**
   * Load a specific template by name
   */
  load(templateName: string): TemplateInfo | null {
    const templateDir = path.join(this.templatesDir, templateName);

    if (!fs.existsSync(templateDir)) {
      return null;
    }

    const manifestPath = path.join(templateDir, "template.json");
    const skillPath = path.join(templateDir, "SKILL.md");

    if (!fs.existsSync(manifestPath) || !fs.existsSync(skillPath)) {
      return null;
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, "utf8");
      const manifest = JSON.parse(manifestContent) as TemplateManifest;

      const skillContent = fs.readFileSync(skillPath, "utf8");

      return {
        manifest,
        templateDir,
        skillContent,
      };
    } catch (_error) {
      if (process.env.DEBUG) {
        console.warn(`Failed to load template '${templateName}':`, _error);
      }
      return null;
    }
  }

  /**
   * Install template to user's project
   */
  install(
    template: TemplateInfo,
    projectDir: string,
    variables: Record<string, string> = {},
  ): { skillPath: string } {
    const skillsDir = path.join(projectDir, ".claude", "skills");
    const targetDir = path.join(skillsDir, template.manifest.name);

    // create skill directory
    fs.mkdirSync(targetDir, { recursive: true });

    // apply variable substitution to SKILL.md
    let skillContent = template.skillContent;
    const allVariables = {
      ...(template.manifest.variables ?? {}),
      ...variables,
    };

    for (const [key, value] of Object.entries(allVariables)) {
      const placeholder = `{{${key}}}`;
      skillContent = skillContent.replace(new RegExp(placeholder, "g"), value);
    }

    // write SKILL.md
    const skillPath = path.join(targetDir, "SKILL.md");
    fs.writeFileSync(skillPath, skillContent, "utf8");

    // copy resources directory if it exists
    const resourcesDir = path.join(template.templateDir, "resources");
    if (fs.existsSync(resourcesDir)) {
      const targetResourcesDir = path.join(targetDir, "resources");
      this.copyDirectory(resourcesDir, targetResourcesDir);
    }

    return { skillPath };
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(source: string, target: string): void {
    fs.mkdirSync(target, { recursive: true });

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  /**
   * Get template count
   */
  count(): number {
    return this.loadAll().length;
  }

  /**
   * Group templates by category
   */
  groupByCategory(): Map<string, TemplateInfo[]> {
    const templates = this.loadAll();
    const grouped = new Map<string, TemplateInfo[]>();

    for (const template of templates) {
      const category = template.manifest.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(template);
    }

    return grouped;
  }
}
