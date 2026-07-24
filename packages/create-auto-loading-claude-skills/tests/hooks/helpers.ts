// Test helper utilities for hook testing
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
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
  /** Current Claude Code payloads send `cwd`; older ones sent `working_directory`. */
  cwd?: string;
  working_directory?: string;
  transcript_path?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Created once per process — a fresh dir per call leaked hundreds per suite run. */
let hermeticHomeDir: string | null = null;
function sharedHermeticHome(): string {
  if (!hermeticHomeDir) {
    hermeticHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-home-"));
    const dir = hermeticHomeDir;
    process.once("exit", () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort — a leftover temp dir is not worth failing a test run
      }
    });
  }
  return hermeticHomeDir;
}

/**
 * Build a child env with HOME/USERPROFILE pinned to a throwaway dir.
 *
 * Every hook template merges user scope (~/.claude/skills), so without this a developer's
 * real global rules leak into results and the suite behaves differently on CI.
 * Pass `HOME`/`USERPROFILE` through `overrides` to seed user scope deliberately.
 */
function hermeticEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  env.HOME = sharedHermeticHome();
  env.USERPROFILE = env.HOME;

  // Keep tool caches pointing at the REAL home. Repointing HOME alone made
  // `pnpm exec tsx` re-download corepack on every call (~4s each, and a hard failure on
  // a network-isolated runner) because its cache lives under the home directory.
  const realHome = process.env.HOME ?? process.env.USERPROFILE;
  if (realHome) {
    env.COREPACK_HOME ??= path.join(realHome, ".cache", "node", "corepack");
    env.npm_config_cache ??= path.join(realHome, ".npm");
    env.XDG_CACHE_HOME ??= path.join(realHome, ".cache");
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
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
      env: hermeticEnv(env),
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
      env: hermeticEnv(env),
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
  /** Pass a key with `undefined` to UNSET it (e.g. CLAUDE_PROJECT_DIR) for the child. */
  env: Record<string, string | undefined> = {},
  /** Pin the child's working directory — the last-resort fallback in initHookContext. */
  cwd?: string,
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

  // explicit undefined removes the var from the child env (spawn would otherwise
  // stringify it), which is how a test asserts behavior with CLAUDE_PROJECT_DIR absent
  const childEnv = hermeticEnv(env);

  // spawnSync, not execSync: execSync returns only stdout, so a helper that reported
  // stderr as "" made every `expect(stderr).toBe("")` unfalsifiable
  const result = spawnSync("node", [hookPath], {
    input: JSON.stringify(event),
    env: childEnv,
    cwd,
    encoding: "utf8",
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
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
      env: hermeticEnv({ CLAUDE_PROJECT_DIR: projectDir, ...env }),
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
