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
  /** Working directory from hook input */
  workingDirectory: string;
  /** Whether to initialize session state (default: true) */
  initSessionState?: boolean;
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
 * - Determines project directory (from CLAUDE_PROJECT_DIR env or working_directory)
 * - Initializes session state
 * - Loads configuration
 * - Creates logger
 *
 * @example
 * ```ts
 * const { projectDir, configLoader, config, logger } = initHookContext({
 *   workingDirectory: data.working_directory,
 * });
 * ```
 */
export function initHookContext(options: InitHookContextOptions): HookContext {
  const { workingDirectory, initSessionState: shouldInitSessionState = true } =
    options;

  // determine project directory
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? workingDirectory;

  // initialize session state if requested
  if (shouldInitSessionState) {
    sessionState.init(projectDir);
  }

  // load configuration
  const configLoader = new ConfigLoader(projectDir);
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
