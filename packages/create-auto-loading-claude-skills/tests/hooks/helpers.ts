// Test helper utilities for hook testing
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Error type for execSync failures
 */
export interface ExecSyncError extends Error {
  stdout?: string;
  stderr?: string;
  status?: number;
}

export interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface HookEvent {
  prompt?: string;
  session_id: string;
  working_directory: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/**
 * Execute a TEMPLATE hook directly (for fast logic testing)
 * Uses tsx to run source .ts files during development
 */
export function executeTemplateHook(
  hookName: string,
  event: HookEvent,
  env: Record<string, string> = {},
): HookResult {
  const hookPath = path.join(
    import.meta.dirname,
    "../../src/templates/hooks",
    hookName,
  );

  const input = JSON.stringify(event);

  try {
    const result = execSync(`pnpm exec tsx ${hookPath}`, {
      input,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
    });

    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (error) {
    const execError = error as ExecSyncError;
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Compile a hook template to a temporary JS file for high-performance testing.
 * Removes the 'tsx' startup overhead for repetitive tests (~700ms -> ~50ms per call).
 * Uses esbuild for fast bundling.
 */
export function compileTemplateHook(hookName: string, outDir: string): string {
  const sourcePath = path.join(
    import.meta.dirname,
    "../../src/templates/hooks",
    hookName,
  );
  const outFile = path.join(outDir, hookName.replace(".ts", ".cjs"));

  // use esbuild via pnpm exec for fast bundling
  // use cjs format because proper-lockfile uses CommonJS require()
  execSync(
    `pnpm exec esbuild "${sourcePath}" --bundle --platform=node --format=cjs --target=node18 --outfile="${outFile}"`,
    { stdio: "pipe" },
  );

  return outFile;
}

/**
 * Execute a generic Node.js script (used for pre-compiled hooks)
 * Much faster than tsx (~50ms vs ~700ms startup time)
 */
export function executeNodeScript(
  scriptPath: string,
  event: HookEvent,
  env: Record<string, string> = {},
): HookResult {
  const input = JSON.stringify(event);

  try {
    const result = execSync(`node "${scriptPath}"`, {
      input,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
    });

    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (error) {
    const execError = error as ExecSyncError;
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Execute a COMPILED hook from dist/ (for packaging verification)
 * Tests the actual .js files that get shipped to users
 */
export function executeCompiledHook(
  hookName: string,
  event: HookEvent,
  env: Record<string, string> = {},
): HookResult {
  // compiled hooks are in dist/src/templates/hooks/*.js
  const jsHookName = hookName.replace(/\.ts$/, ".js");
  const hookPath = path.join(
    import.meta.dirname,
    "../../dist/src/templates/hooks",
    jsHookName,
  );

  if (!fs.existsSync(hookPath)) {
    throw new Error(
      `Compiled hook not found: ${hookPath}. Run 'pnpm build' first.`,
    );
  }

  const input = JSON.stringify(event);

  try {
    const result = execSync(`node ${hookPath}`, {
      input,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
    });

    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (error) {
    const execError = error as ExecSyncError;
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Execute a GENERATED hook from .claude/hooks/ (for packaging verification)
 * Generated hooks are pre-compiled .js files that run with node
 */
export function executeGeneratedHook(
  projectDir: string,
  hookName: string,
  event: HookEvent,
  env: Record<string, string> = {},
): HookResult {
  // generated hooks are .js files
  const jsHookName = hookName.replace(/\.ts$/, ".js");
  const hookPath = path.join(projectDir, ".claude/hooks", jsHookName);

  if (!fs.existsSync(hookPath)) {
    throw new Error(`Generated hook not found: ${hookPath}`);
  }

  const input = JSON.stringify(event);

  try {
    const stdout = execSync(`node ${hookPath}`, {
      input,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
        ...env,
      },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const execError = error as ExecSyncError;
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Setup a mock project with skill-rules.yaml
 */
export function setupMockProject(tmpDir: string): void {
  const claudeDir = path.join(tmpDir, ".claude");
  const skillsDir = path.join(claudeDir, "skills");
  const cacheDir = path.join(claudeDir, "cache");

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  // Create minimal skill-rules.yaml
  const skillRules = `version: "1.0"
settings:
  maxSuggestions: 3
  scoring:
    keywordMatchScore: 10
    intentPatternScore: 20
    filePathMatchScore: 15
    fileContentMatchScore: 15
  thresholds:
    recentActivationMinutes: 5
skills:
  backend-dev-guidelines:
    type: domain
    enforcement: suggest
    priority: high
    description: "Backend API patterns"
    promptTriggers:
      keywords:
        - API
        - endpoint
        - controller
        - service
    fileTriggers:
      pathPatterns:
        - "src/api/**/*.ts"
      contentPatterns:
        - "import.*express"
    validationRules:
      - name: "error-tracking"
        condition:
          pattern: "try\\\\s*\\\\{"
        requirement:
          pattern: "catch"
        reminder: "Did you add error handling?"
`;

  fs.writeFileSync(
    path.join(skillsDir, "skill-rules.yaml"),
    skillRules,
    "utf8",
  );

  // Create empty session state
  fs.writeFileSync(
    path.join(cacheDir, "session-test.json"),
    JSON.stringify({
      modifiedFiles: [],
      activeDomains: [],
      lastActivatedSkills: {},
      currentPromptSkills: [],
      toolUseCount: 0,
      createdAt: Date.now(),
    }),
    "utf8",
  );
}

/**
 * Setup project with validation rules for Stop hook testing
 */
export function setupMockProjectWithValidation(tmpDir: string): void {
  const claudeDir = path.join(tmpDir, ".claude");
  const skillsDir = path.join(claudeDir, "skills");
  const cacheDir = path.join(claudeDir, "cache");

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  // Create skill-rules.yaml with validation rules
  const skillRules = `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  backend-dev-guidelines:
    type: domain
    enforcement: suggest
    priority: high
    description: "Backend API patterns"
    promptTriggers:
      keywords:
        - API
        - controller
    fileTriggers:
      pathPatterns:
        - "src/api/**/*.ts"
    validationRules:
      - name: "error-tracking"
        condition:
          pattern: "try\\\\s*\\\\{"
        requirement:
          pattern: "Sentry\\\\.captureException"
        reminder: "Did you add Sentry.captureException() to catch blocks?"
`;

  fs.writeFileSync(
    path.join(skillsDir, "skill-rules.yaml"),
    skillRules,
    "utf8",
  );
}

/**
 * Setup project with content patterns for testing
 */
export function setupMockProjectWithContentPatterns(tmpDir: string): void {
  const claudeDir = path.join(tmpDir, ".claude");
  const skillsDir = path.join(claudeDir, "skills");
  const cacheDir = path.join(claudeDir, "cache");

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const skillRules = `version: "1.0"
settings:
  maxSuggestions: 3
  scoring:
    keywordMatchScore: 10
    intentPatternScore: 20
    filePathMatchScore: 15
    fileContentMatchScore: 15
skills:
  backend-dev-guidelines:
    type: domain
    enforcement: suggest
    priority: high
    description: "Backend patterns"
    promptTriggers:
      keywords:
        - API
    fileTriggers:
      pathPatterns:
        - "src/api/**/*.ts"
        - "src/**/*Controller.ts"
      contentPatterns:
        - "import.*express"
        - "export.*Controller"
`;

  fs.writeFileSync(
    path.join(skillsDir, "skill-rules.yaml"),
    skillRules,
    "utf8",
  );
}

/**
 * Create corrupted config for failure testing
 */
export function createCorruptedYAML(tmpDir: string): void {
  const yamlPath = path.join(tmpDir, ".claude/skills/skill-rules.yaml");
  fs.writeFileSync(yamlPath, "invalid: yaml: [unclosed\n  bad: indent", "utf8");
}

/**
 * Create corrupted session JSON for failure testing
 */
export function createCorruptedSession(
  tmpDir: string,
  sessionId: string,
): void {
  const sessionPath = path.join(
    tmpDir,
    `.claude/cache/session-${sessionId}.json`,
  );
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, "{invalid json", "utf8");
}

/**
 * Create symlink safely (handles Windows compatibility)
 */
export function createSymlinkSafe(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (process.platform === "win32" && nodeError.code === "EPERM") {
      // Windows without symlink support - copy file instead
      fs.copyFileSync(target, link);
      console.warn("⚠️  Symlinks unavailable, using file copy instead");
      return false;
    }
    throw error;
  }
}
