#!/usr/bin/env node

/**
 * PreToolUse hook with JSON output (v2.1 - CORRECTED)
 *
 * Implements guardrails that can block tool execution using the native
 * hook permission system per official HOOKS_REFERENCE_CLAUDE.md:
 *
 * - Uses hookSpecificOutput.permissionDecision (allow/deny/ask)
 * - NOT the deprecated decision: "block" / decision: "Proceed"
 * - additionalContext is a STRING, not an object
 *
 * Output examples:
 * - Allow: {} or { hookSpecificOutput: { permissionDecision: "allow" } }
 * - Deny: { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "..." } }
 * - Ask: { hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "..." } }
 */
import {
  buildPreToolUseContextOutput,
  buildPreToolUseDenyOutput,
  handleHookError,
  initHookContext,
  readStdin,
  resolveHookDir,
  RuleMatcher,
} from "@satoshibits/claude-skill-runtime";

import type {
  DebugLogger,
  PreToolMatch,
  PreToolUseOutput,
} from "@satoshibits/claude-skill-runtime";

interface PreToolUseHookInput {
  session_id: string;
  cwd?: string;
  working_directory?: string;
  tool_name: string;
  /** Claude Code sends an object (e.g. { command: "…" }); older payloads sent a string. */
  tool_input: unknown;
}

/**
 * Build deny output for blocking guardrails
 */
function buildDenyOutputForMatch(
  match: PreToolMatch,
  skillContent: string | null,
): PreToolUseOutput {
  const reason = `Guardrail "${match.skillName}" triggered: ${match.rule.description}`;

  // include skill content in additionalContext if available
  let additionalContext: string | undefined;
  if (skillContent) {
    additionalContext = `=== GUARDRAIL: ${match.skillName} ===\n${skillContent}`;
  }

  return buildPreToolUseDenyOutput(reason, additionalContext);
}

/**
 * Build advisory output for "warn" enforcement.
 *
 * A warning must INFORM without changing the permission outcome, so this emits
 * additionalContext with NO permissionDecision. It must never return `"allow"`: that
 * would grant the tool call, and a `warn`-severity guardrail silently authorizing a tool
 * (now that `inputPatterns` actually match object `tool_input`) is worse than not firing.
 */
function buildWarningOutput(
  warnings: { skill: string; description: string; pattern?: string }[],
): PreToolUseOutput {
  if (warnings.length === 0) {
    // no warnings - neutral, tool proceeds through the normal permission flow
    return {};
  }

  // format warnings as string for additionalContext
  const warningLines = warnings.map(
    (w) =>
      `- ${w.skill}: ${w.description}${w.pattern ? ` (pattern: ${w.pattern})` : ""}`,
  );
  const additionalContext = `=== GUARDRAIL WARNINGS ===\nThe following guardrails matched but are not blocking:\n${warningLines.join("\n")}`;

  return buildPreToolUseContextOutput(additionalContext);
}

/**
 * Main PreToolUse hook
 */
async function main() {
  let logger: DebugLogger | null = null;

  try {
    const input = await readStdin();
    const data: PreToolUseHookInput = JSON.parse(input) as PreToolUseHookInput;

    const { session_id, tool_name, tool_input } = data;

    // initialize hook context
    const {
      projectDir,
      configLoader,
      config,
      logger: contextLogger,
    } = initHookContext({
      cwd: resolveHookDir(data),
      userScope: true,
    });
    logger = contextLogger;

    logger.log("activation", "PreToolUse JSON hook started (v2.1 corrected)", {
      sessionId: session_id,
      toolName: tool_name,
      // cheap shape info only — serializing the payload here would cost a full
      // stringify of every Write/Edit on every tool call, for a debug-only field
      inputType: typeof tool_input,
    });

    // match pre-tool triggers
    const matcher = new RuleMatcher(config, projectDir, logger);
    const matches = matcher.matchPreToolTriggers(tool_name, tool_input);

    logger.log("activation", "matching complete", {
      matchCount: matches.length,
    });

    if (matches.length === 0) {
      // no matches - return empty (allows tool to proceed)
      console.log(JSON.stringify({}));
      process.exit(0);
    }

    // check for blocking guardrails (enforcement: "block")
    const blockingMatches = matches.filter(
      (m) => m.rule.enforcement === "block",
    );

    const firstBlockingMatch = blockingMatches[0];
    if (firstBlockingMatch) {
      // deny on first blocking match
      const skillContent = configLoader.loadSkillContent(firstBlockingMatch.skillName);

      logger.log("activation", "denying tool execution", {
        skill: firstBlockingMatch.skillName,
        tool: tool_name,
        pattern: firstBlockingMatch.matchedPattern,
      });

      const output = buildDenyOutputForMatch(firstBlockingMatch, skillContent);
      console.log(JSON.stringify(output, null, 2));
      process.exit(0);
    }

    // collect warnings (enforcement: "warn")
    const warningMatches = matches.filter((m) => m.rule.enforcement === "warn");

    const warnings = warningMatches.map((m) => ({
      skill: m.skillName,
      description: m.rule.description,
      pattern: m.matchedPattern,
    }));

    if (warnings.length > 0) {
      logger.log("activation", "surfacing warnings (no permission change)", {
        warningCount: warnings.length,
      });
    }

    const output = buildWarningOutput(warnings);
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (error) {
    // on error, return empty (allows tool to proceed)
    // per official docs: don't block on errors
    handleHookError(error, logger, { hookName: "PreToolUseJSON" });
    console.log(JSON.stringify({}));
    process.exit(0);
  }
}

// Run
// cjs-compatible entry point
main().catch(console.error);
