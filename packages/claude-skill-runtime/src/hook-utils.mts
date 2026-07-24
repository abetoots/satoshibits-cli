/**
 * Hook Utilities - shared utilities for Claude Code hook templates
 *
 * These utilities eliminate code duplication between hook templates,
 * allowing bug fixes and improvements to be applied via `npm update`
 * without regenerating hooks.
 */

import type { DebugLogger, SkillConfig } from "./types.mjs";
import { ConfigLoader, getLogger } from "./config-loader.mjs";
import { sessionState } from "./session-state.mjs";

/**
 * Hook context returned by initHookContext
 */
export interface HookContext {
  projectDir: string;
  configLoader: ConfigLoader;
  config: SkillConfig;
  logger: DebugLogger;
}

/**
 * Options for initializing hook context
 */
export interface InitHookContextOptions {
  /**
   * Working directory from hook input.
   *
   * Claude Code sends this as `cwd`; older payloads used `working_directory`.
   * Prefer passing the raw payload field through `resolveHookDir()` so both shapes work.
   */
  workingDirectory?: string;
  /** Current working directory from hook input (`cwd` in current Claude Code payloads) */
  cwd?: string;
  /** Whether to initialize session state (default: true) */
  initSessionState?: boolean;
  /**
   * Also read user-level rules from ~/.claude/skills/ and merge them under project rules
   * (project wins on skill-name collision). Default false — project-only, unchanged.
   */
  userScope?: boolean;
}

/**
 * Raw hook payload fields that can carry the invocation directory.
 *
 * Claude Code currently sends `cwd`; earlier versions sent `working_directory`.
 * Hook templates should not read either field directly.
 */
export interface HookDirInput {
  cwd?: string;
  working_directory?: string;
}

/**
 * Resolve the directory a hook was invoked in, across payload shapes.
 *
 * Returns undefined when neither field is present, so callers can fall back
 * (initHookContext falls back to CLAUDE_PROJECT_DIR, then process.cwd()).
 *
 * @example
 * ```ts
 * const data = JSON.parse(await readStdin()) as HookDirInput & { prompt: string };
 * const ctx = initHookContext({ cwd: resolveHookDir(data) });
 * ```
 */
export function resolveHookDir(data: HookDirInput | undefined): string | undefined {
  return data?.cwd ?? data?.working_directory;
}

/**
 * Options for error handling
 */
export interface HandleHookErrorOptions {
  /** Hook name for logging context */
  hookName: string;
  /** Whether to output debug info to stderr when DEBUG env is set (default: false) */
  debugOutput?: boolean;
  /** Custom message prefix for console.error (default: undefined, no console output) */
  consoleErrorPrefix?: string;
}

/**
 * Read from stdin
 *
 * Used by all hook templates to receive JSON input from Claude Code.
 * Returns a promise that resolves with the full stdin content as a string.
 *
 * @example
 * ```ts
 * const input = await readStdin();
 * const data = JSON.parse(input);
 * ```
 */
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk.toString()));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (err) => reject(err));
  });
}

/**
 * Initialize standard hook context
 *
 * Consolidates the common initialization pattern used by all hooks:
 * - Determines project directory (CLAUDE_PROJECT_DIR env, then cwd, then working_directory,
 *   then process.cwd() — so a payload missing every directory field still resolves)
 * - Initializes session state
 * - Loads configuration
 * - Creates logger
 *
 * @example
 * ```ts
 * const { projectDir, configLoader, config, logger } = initHookContext({
 *   cwd: resolveHookDir(data),
 * });
 * ```
 */
export function initHookContext(options: InitHookContextOptions): HookContext {
  const {
    workingDirectory,
    cwd,
    initSessionState: shouldInitSessionState = true,
    userScope = false,
  } = options;

  // determine project directory; process.cwd() is the last resort so a hook never
  // throws on an unfamiliar payload shape
  const projectDir =
    process.env.CLAUDE_PROJECT_DIR ?? cwd ?? workingDirectory ?? process.cwd();

  // initialize session state if requested
  if (shouldInitSessionState) {
    sessionState.init(projectDir);
  }

  // load configuration
  const configLoader = new ConfigLoader(projectDir, { userScope });
  const config = configLoader.loadSkillRules();

  // create logger
  const logger = getLogger(projectDir, config);

  return {
    projectDir,
    configLoader,
    config,
    logger,
  };
}

/**
 * Handle hook errors consistently
 *
 * Provides standardized error handling for hooks:
 * - Logs error to debug logger
 * - Optionally outputs to stderr if DEBUG env is set
 * - Follows the "silent failure" pattern (hooks should not block Claude)
 *
 * @example
 * ```ts
 * catch (error) {
 *   handleHookError(error, logger, {
 *     hookName: 'PreToolUse',
 *     debugOutput: true,
 *   });
 *   process.exit(0);
 * }
 * ```
 */
export function handleHookError(
  error: unknown,
  logger: DebugLogger | null,
  options: HandleHookErrorOptions
): void {
  const { hookName, debugOutput = false, consoleErrorPrefix } = options;

  if (error instanceof Error) {
    logger?.log("error", `${hookName} hook failed`, {
      error: error.message,
      stack: error.stack,
    });

    // optional console output for debugging
    if (consoleErrorPrefix) {
      console.error(`${consoleErrorPrefix}:`, error.message);
    }
  } else {
    // handle non-Error throws (strings, objects, etc.)
    logger?.log("error", `${hookName} hook failed`, {
      error: String(error),
    });

    if (consoleErrorPrefix) {
      console.error(`${consoleErrorPrefix}:`, String(error));
    }
  }

  // optional DEBUG env output
  if (debugOutput && process.env.DEBUG) {
    console.error(`${hookName} hook error:`, error);
  }
}
