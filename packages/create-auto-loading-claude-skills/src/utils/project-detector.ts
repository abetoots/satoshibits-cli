import fs from "fs";
import path from "path";

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface FileScans {
  tsconfig: boolean;
  dockerfile: boolean;
  prismaSchema: boolean;
  viteConfig: boolean;
  nextConfig: boolean;
}

export interface ProjectConfig {
  type: "backend" | "frontend" | "fullstack" | "testing" | "devops" | "custom";
  frameworks: string[];
  language: "typescript" | "javascript";
  databases: string[];
  testing: string[];
}

/**
 * Auto-detect project type and frameworks
 */
export class ProjectDetector {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Detect project configuration
   */
  detect(): ProjectConfig {
    const packageJson = this.readPackageJson();
    const files = this.scanFiles();

    return {
      type: this.detectProjectType(packageJson, files),
      frameworks: this.detectFrameworks(packageJson, files),
      language: this.detectLanguage(files),
      databases: this.detectDatabases(packageJson, files),
      testing: this.detectTestingFrameworks(packageJson),
    };
  }

  /**
   * Read package.json
   */
  private readPackageJson(): PackageJson | null {
    try {
      const pkgPath = path.join(this.projectDir, "package.json");
      const content = fs.readFileSync(pkgPath, "utf8");
      return JSON.parse(content) as PackageJson;
    } catch {
      return null;
    }
  }

  /**
   * Scan for key files
   */
  private scanFiles(): FileScans {
    return {
      tsconfig: fs.existsSync(path.join(this.projectDir, "tsconfig.json")),
      dockerfile: fs.existsSync(path.join(this.projectDir, "Dockerfile")),
      prismaSchema: fs.existsSync(
        path.join(this.projectDir, "prisma", "schema.prisma"),
      ),
      viteConfig:
        fs.existsSync(path.join(this.projectDir, "vite.config.ts")) ||
        fs.existsSync(path.join(this.projectDir, "vite.config.js")),
      nextConfig:
        fs.existsSync(path.join(this.projectDir, "next.config.js")) ||
        fs.existsSync(path.join(this.projectDir, "next.config.ts")),
    };
  }

  /**
   * Detect project type
   */
  private detectProjectType(
    pkg: PackageJson | null,
    _files: FileScans,
  ): ProjectConfig["type"] {
    if (!pkg) return "custom";

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // check for frontend indicators
    const hasFrontend = ["react", "vue", "svelte", "@angular/core"].some(
      (fw) => deps[fw],
    );

    // check for backend indicators
    const hasBackend = ["express", "fastify", "@nestjs/core", "fastapi"].some(
      (fw) => deps[fw],
    );

    if (hasFrontend && hasBackend) return "fullstack";
    if (hasFrontend) return "frontend";
    if (hasBackend) return "backend";

    return "custom";
  }

  /**
   * Detect frameworks
   */
  private detectFrameworks(
    pkg: PackageJson | null,
    files: FileScans,
  ): string[] {
    if (!pkg) return [];

    const frameworks: string[] = [];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // backend frameworks
    if (deps.express) frameworks.push("express");
    if (deps.fastify) frameworks.push("fastify");
    if (deps["@nestjs/core"]) frameworks.push("nestjs");

    // frontend frameworks
    if (deps.react) frameworks.push("react");
    if (deps.vue) frameworks.push("vue");
    if (deps.svelte) frameworks.push("svelte");
    if (deps["@angular/core"]) frameworks.push("angular");

    // meta-frameworks
    if (files.nextConfig) frameworks.push("nextjs");
    if (files.viteConfig) frameworks.push("vite");

    return frameworks;
  }

  /**
   * Detect language
   */
  private detectLanguage(files: FileScans): "typescript" | "javascript" {
    return files.tsconfig ? "typescript" : "javascript";
  }

  /**
   * Detect databases
   */
  private detectDatabases(pkg: PackageJson | null, files: FileScans): string[] {
    if (!pkg) return [];

    const databases: string[] = [];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["@prisma/client"] || files.prismaSchema) databases.push("prisma");
    if (deps.typeorm) databases.push("typeorm");
    if (deps["drizzle-orm"]) databases.push("drizzle");
    if (deps.mongoose) databases.push("mongoose");

    return databases;
  }

  /**
   * Detect testing frameworks
   */
  private detectTestingFrameworks(pkg: PackageJson | null): string[] {
    if (!pkg) return [];

    const testing: string[] = [];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.jest) testing.push("jest");
    if (deps.vitest) testing.push("vitest");
    if (deps["@playwright/test"]) testing.push("playwright");
    if (deps.cypress) testing.push("cypress");

    return testing;
  }
}
