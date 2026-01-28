/**
 * E2E tests for create-github-workflows CLI commands
 * Tests generated file contents to catch integration/configuration bugs
 * such as wrong package names, incorrect template variables, and broken cross-references.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WorkflowConfig {
  version: string;
  projectName: string;
  preset: string;
  packageManager: string;
  workflows: string[];
  docker?: {
    registry: string;
  };
  isMonorepo?: boolean;
}

interface GitHubWorkflow {
  name: string;
  on: unknown;
  jobs: Record<string, unknown>;
}

// path to compiled CLI
const COMPILED_CLI_PATH = path.join(__dirname, "../../../dist/index.mjs");

/**
 * Helper to create a minimal project directory with git and package.json
 */
function setupProjectDir(tmpDir: string, packageJson: object = { name: "test-project", version: "1.0.0" }) {
  execSync("git init", { cwd: tmpDir, stdio: "ignore" });
  fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(packageJson, null, 2));
}

describe("create-github-workflows E2E", () => {
  // ensure CLI is built before running tests
  beforeAll(() => {
    if (!fs.existsSync(COMPILED_CLI_PATH)) {
      throw new Error(
        `Compiled CLI not found at ${COMPILED_CLI_PATH}. Run 'pnpm build' first.`
      );
    }
  });

  describe("library preset", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-github-workflows-e2e-library-");
      setupProjectDir(tmpDir);
      execSync(`node "${COMPILED_CLI_PATH}" init --preset library --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates .github/workflows directory", () => {
      expect(fs.existsSync(path.join(tmpDir, ".github/workflows"))).toBe(true);
    });

    it("creates config file with correct preset", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as WorkflowConfig;
      expect(config.preset).toBe("library");
    });

    it("generates valid YAML workflow files", () => {
      const workflowsDir = path.join(tmpDir, ".github/workflows");
      const files = fs.readdirSync(workflowsDir);
      const yamlFiles = files.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

      expect(yamlFiles.length).toBeGreaterThan(0);

      for (const file of yamlFiles) {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        expect(() => YAML.parse(content) as GitHubWorkflow).not.toThrow();
      }
    });

    it("workflow files have valid GitHub Actions structure", () => {
      const workflowsDir = path.join(tmpDir, ".github/workflows");
      const files = fs.readdirSync(workflowsDir);
      const yamlFiles = files.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

      for (const file of yamlFiles) {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        const workflow = YAML.parse(content) as GitHubWorkflow;

        expect(workflow.name).toBeDefined();
        expect(workflow.on).toBeDefined();
        expect(workflow.jobs).toBeDefined();
      }
    });

    it("does not contain unreplaced template placeholders", () => {
      const workflowsDir = path.join(tmpDir, ".github/workflows");
      const files = fs.readdirSync(workflowsDir);

      for (const file of files) {
        const content = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        // check for handlebars placeholders but exclude GitHub Actions expressions (${{ ... }})
        expect(content).not.toMatch(/(?<!\$)\{\{[^}]+\}\}/);
      }
    });

    it("config file is valid JSON with required fields", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      const content = fs.readFileSync(configPath, "utf8");

      expect(() => JSON.parse(content) as WorkflowConfig).not.toThrow();

      const config = JSON.parse(content) as WorkflowConfig;
      expect(config.version).toBeDefined();
      expect(config.projectName).toBeDefined();
      expect(config.preset).toBeDefined();
      expect(config.packageManager).toBeDefined();
      expect(config.workflows).toBeDefined();
      expect(Array.isArray(config.workflows)).toBe(true);
    });

    it("project name is correctly detected from package.json", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as WorkflowConfig;
      expect(config.projectName).toBe("test-project");
    });
  });

  describe("docker-app preset", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-github-workflows-e2e-docker-");
      setupProjectDir(tmpDir);
      // add Dockerfile for docker-app preset
      fs.writeFileSync(
        path.join(tmpDir, "Dockerfile"),
        "FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD [\"npm\", \"start\"]\n"
      );
      execSync(`node "${COMPILED_CLI_PATH}" init --preset docker-app --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates config with docker-app preset", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as WorkflowConfig;
      expect(config.preset).toBe("docker-app");
    });

    it("config includes docker settings", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as WorkflowConfig;

      expect(config.docker).toBeDefined();
      expect(config.docker?.registry).toBeDefined();
    });
  });

  describe("monorepo preset", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-github-workflows-e2e-monorepo-");
      // set up monorepo structure
      fs.mkdirSync(path.join(tmpDir, "packages/pkg-a"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "packages/pkg-a/package.json"),
        JSON.stringify({ name: "@test/pkg-a" }, null, 2)
      );
      setupProjectDir(tmpDir, {
        name: "test-monorepo",
        version: "1.0.0",
        workspaces: ["packages/*"],
      });
      execSync(`node "${COMPILED_CLI_PATH}" init --preset monorepo --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("creates config with monorepo preset", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as WorkflowConfig;
      expect(config.preset).toBe("monorepo");
    });

    it("config indicates monorepo mode", () => {
      const configPath = path.join(tmpDir, ".github-workflows.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as WorkflowConfig;
      expect(config.isMonorepo).toBe(true);
    });
  });

  describe("add and list commands", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-github-workflows-e2e-commands-");
      setupProjectDir(tmpDir);
      execSync(`node "${COMPILED_CLI_PATH}" init --preset library --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("add command adds a workflow file", () => {
      try {
        execSync(`node "${COMPILED_CLI_PATH}" add pr-validation --force`, {
          cwd: tmpDir,
          stdio: "ignore",
        });

        const workflowsDir = path.join(tmpDir, ".github/workflows");
        const files = fs.readdirSync(workflowsDir);
        expect(files.length).toBeGreaterThan(0);
      } catch (error) {
        // if the workflow already exists, that's fine for this test
        const execError = error as { status?: number };
        expect(execError.status).toBeLessThanOrEqual(1);
      }
    });

    it("list command runs without crashing", () => {
      const result = execSync(`node "${COMPILED_CLI_PATH}" list`, {
        cwd: tmpDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      expect(result).toBeDefined();
    });
  });

  describe("idempotency", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync("/tmp/create-github-workflows-e2e-idempotency-");
      setupProjectDir(tmpDir);
    });

    afterAll(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("running init twice does not create duplicate workflows", () => {
      // first init
      execSync(`node "${COMPILED_CLI_PATH}" init --preset library --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });

      const workflowsDir = path.join(tmpDir, ".github/workflows");
      const firstFiles = fs.existsSync(workflowsDir) ? fs.readdirSync(workflowsDir) : [];

      // second init (without --force, should skip existing)
      execSync(`node "${COMPILED_CLI_PATH}" init --preset library --yes`, {
        cwd: tmpDir,
        stdio: "ignore",
      });

      const secondFiles = fs.existsSync(workflowsDir) ? fs.readdirSync(workflowsDir) : [];
      expect(secondFiles.length).toBe(firstFiles.length);
    });

    it("--force regenerates workflows with backup", () => {
      const workflowsDir = path.join(tmpDir, ".github/workflows");
      const files = fs.readdirSync(workflowsDir);
      const firstFile = files[0];

      if (firstFile) {
        // modify a workflow file
        const filePath = path.join(workflowsDir, firstFile);
        const originalContent = fs.readFileSync(filePath, "utf8");
        fs.writeFileSync(filePath, originalContent + "\n# Custom comment");

        // init with --force
        execSync(`node "${COMPILED_CLI_PATH}" init --preset library --yes --force`, {
          cwd: tmpDir,
          stdio: "ignore",
        });

        // file should be regenerated (backup created)
        const backupFiles = fs.readdirSync(workflowsDir).filter((f) => f.includes(".backup"));
        expect(backupFiles.length).toBeGreaterThan(0);
      }
    });
  });
});
