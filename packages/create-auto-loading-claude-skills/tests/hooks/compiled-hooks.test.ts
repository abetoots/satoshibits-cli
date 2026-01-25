/**
 * Integration tests for pre-compiled JavaScript hooks
 *
 * These tests verify that:
 * 1. Compiled .js files exist in dist/
 * 2. No .ts files are shipped (clean build)
 * 3. Compiled hooks execute correctly with node
 *
 * IMPORTANT: Run `pnpm build` before running these tests
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { executeCompiledHook, setupMockProject } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distHooksDir = path.join(__dirname, "../../dist/src/templates/hooks");
// note: _internal directory is now in claude-skill-runtime package

describe("Compiled Hooks", () => {
  beforeAll(() => {
    // verify dist exists
    if (!fs.existsSync(distHooksDir)) {
      throw new Error(
        `dist/src/templates/hooks/ not found. Run 'pnpm build' first.`,
      );
    }
  });

  describe("Build output structure", () => {
    it("should have compiled .js hook files", () => {
      const expectedHooks = [
        "skill-activation-prompt.js",
        "post-tool-use-tracker.js",
        "stop-validator.js",
      ];

      for (const hook of expectedHooks) {
        const hookPath = path.join(distHooksDir, hook);
        expect(fs.existsSync(hookPath)).toBe(true);
      }
    });

    // note: _internal/*.js files are now in claude-skill-runtime package
    // the hooks import from the runtime package instead of local _internal/

    it("should NOT have .ts files in dist hooks directory", () => {
      const files = fs.readdirSync(distHooksDir);
      const tsFiles = files.filter(
        (f) => f.endsWith(".ts") && !f.endsWith(".d.ts"),
      );

      expect(tsFiles.length).toBe(0);
    });

    // note: _internal directory no longer exists in templates (moved to claude-skill-runtime)

    it("should NOT have tsconfig.json in dist hooks directory", () => {
      const tsconfigPath = path.join(distHooksDir, "tsconfig.json");
      expect(fs.existsSync(tsconfigPath)).toBe(false);
    });
  });

  describe("Compiled hook execution", () => {
    let tmpDir: string;

    beforeAll(() => {
      // create temp directory for test project
      tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".test-compiled-"));
      setupMockProject(tmpDir);
    });

    it("should execute skill-activation-prompt.js with node", () => {
      const result = executeCompiledHook(
        "skill-activation-prompt.ts", // helper converts to .js
        {
          prompt: "Create an API endpoint",
          session_id: "compiled-test-1",
          working_directory: tmpDir,
        },
      );

      // should not crash (exit code 0)
      expect(result.exitCode).toBe(0);

      // hook should produce no stderr errors
      expect(result.stderr).toBe("");

      // hook outputs formatted text (not JSON) when skills match,
      // or empty output when no skills match - both are valid
      // verify: if output exists, it should contain skill-related content
      if (result.stdout.trim()) {
        expect(
          result.stdout.includes("SKILL") ||
            result.stdout.includes("backend-dev") ||
            result.stdout.includes("---"),
        ).toBe(true);
      }
    });

    it("should execute post-tool-use-tracker.js with node", () => {
      const result = executeCompiledHook(
        "post-tool-use-tracker.ts", // helper converts to .js
        {
          session_id: "compiled-test-2",
          working_directory: tmpDir,
          tool_name: "Edit",
          tool_input: { file_path: "/test/file.ts" },
        },
      );

      // should not crash
      expect(result.exitCode).toBe(0);

      // hook should produce no stderr errors
      expect(result.stderr).toBe("");

      // stdout may be empty or contain output
      expect(typeof result.stdout).toBe("string");
    });

    it("should execute stop-validator.js with node", () => {
      const result = executeCompiledHook(
        "stop-validator.ts", // helper converts to .js
        {
          session_id: "compiled-test-3",
          working_directory: tmpDir,
        },
      );

      // should not crash
      expect(result.exitCode).toBe(0);

      // hook should produce no stderr errors
      expect(result.stderr).toBe("");

      // stdout may be empty or contain output
      expect(typeof result.stdout).toBe("string");
    });

    afterAll(() => {
      // cleanup temp directory
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
