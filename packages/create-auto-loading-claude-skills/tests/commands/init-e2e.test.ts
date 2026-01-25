/**
 * E2E tests for init command
 * Tests generated file contents to catch integration/configuration bugs
 * such as wrong package names, incorrect template variables, and broken cross-references.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// path to compiled CLI (built with tsc)
const COMPILED_CLI_PATH = path.join(__dirname, "../../dist/src/bin/cli.js");

describe("init command E2E", () => {
  // ensure CLI is built before running tests
  beforeAll(() => {
    if (!fs.existsSync(COMPILED_CLI_PATH)) {
      throw new Error(
        `Compiled CLI not found at ${COMPILED_CLI_PATH}. Run 'pnpm build' first.`
      );
    }
  });

  describe("init --yes output", () => {
    let tmpDir: string;

    // single CLI invocation for all tests in this group
    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/init-e2e-test-");
      execSync(`node "${COMPILED_CLI_PATH}" init --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    describe("generated file structure", () => {
      it("creates required directories", () => {
        expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, ".claude/hooks"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, ".claude/skills"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, ".claude/cache"))).toBe(true);
      });

      it("creates settings.json with valid structure", () => {
        const settingsPath = path.join(tmpDir, ".claude/settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);

        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { hooks?: unknown };
        expect(settings.hooks).toBeDefined();
      });

      it("creates skill-rules.yaml with valid YAML", () => {
        const rulesPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
        expect(fs.existsSync(rulesPath)).toBe(true);

        const content = fs.readFileSync(rulesPath, "utf8");
        expect(() => yaml.load(content)).not.toThrow();
      });

      it("creates .gitignore for cache directory", () => {
        const gitignorePath = path.join(tmpDir, ".claude/cache/.gitignore");
        expect(fs.existsSync(gitignorePath)).toBe(true);

        const content = fs.readFileSync(gitignorePath, "utf8");
        expect(content).toContain("*");
        expect(content).toContain("!.gitignore");
      });
    });

    describe("hooks package.json correctness", () => {
      interface HooksPackageJson {
        name?: string;
        type?: string;
        private?: boolean;
        dependencies?: Record<string, string | undefined>;
      }

      it("has correct package name for claude-skill-runtime dependency", () => {
        const hooksPkgPath = path.join(tmpDir, ".claude/hooks/package.json");
        expect(fs.existsSync(hooksPkgPath)).toBe(true);

        const hooksPkg = JSON.parse(fs.readFileSync(hooksPkgPath, "utf8")) as HooksPackageJson;

        // verify the scoped package name is used (not the bare name)
        expect(hooksPkg.dependencies).toBeDefined();
        expect(hooksPkg.dependencies?.["@satoshibits/claude-skill-runtime"]).toBeDefined();

        // ensure the old incorrect name is not present
        expect(hooksPkg.dependencies?.["claude-skill-runtime"]).toBeUndefined();
      });

      it("has valid package.json structure", () => {
        const hooksPkgPath = path.join(tmpDir, ".claude/hooks/package.json");
        const hooksPkg = JSON.parse(fs.readFileSync(hooksPkgPath, "utf8")) as HooksPackageJson;

        expect(hooksPkg.name).toBe("claude-hooks");
        expect(hooksPkg.type).toBe("module");
        expect(hooksPkg.private).toBe(true);
      });
    });

    describe("template variable replacement", () => {
      it("does not contain unreplaced template placeholders", () => {
        const filesToCheck = [
          ".claude/settings.json",
          ".claude/skills/skill-rules.yaml",
          ".claude/hooks/package.json",
        ];

        for (const file of filesToCheck) {
          const filePath = path.join(tmpDir, file);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf8");
            expect(content).not.toMatch(/\{\{[^}]+\}\}/); // handlebars style
            expect(content).not.toMatch(/<%= .+ %>/); // ejs style
            expect(content).not.toMatch(/\$\{[^}]+\}/); // template literal placeholders
          }
        }
      });
    });

    describe("cross-file references", () => {
      interface SettingsHook {
        command?: string;
      }

      interface SettingsJson {
        hooks?: Record<string, SettingsHook[]>;
      }

      it("settings.json hook paths point to existing directories", () => {
        const settingsPath = path.join(tmpDir, ".claude/settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as SettingsJson;

        if (settings.hooks) {
          for (const hookType of Object.keys(settings.hooks)) {
            const hooks = settings.hooks[hookType];
            if (Array.isArray(hooks)) {
              for (const hook of hooks) {
                if (hook.command && typeof hook.command === "string") {
                  const match = /\.claude\/hooks\/[\w-]+\.js/.exec(hook.command);
                  if (match?.[0]) {
                    const hookFilePath = path.join(tmpDir, match[0]);
                    // hook files may not exist until compiled, but the directory should
                    expect(fs.existsSync(path.dirname(hookFilePath))).toBe(true);
                  }
                }
              }
            }
          }
        }
      });
    });
  });

  describe("idempotency", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/init-e2e-idempotency-");
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("running init twice does not corrupt files", () => {
      // first init
      execSync(`node "${COMPILED_CLI_PATH}" init --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });

      const settingsPath = path.join(tmpDir, ".claude/settings.json");

      // second init
      execSync(`node "${COMPILED_CLI_PATH}" init --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });

      // verify structure is still valid
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { hooks?: unknown };
      expect(settings.hooks).toBeDefined();
      expect(() => {
        JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      }).not.toThrow();
    });
  });
});
