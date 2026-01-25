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
  buildPreToolUseAllowOutput,
  buildPreToolUseDenyOutput,
  handleHookError,
  initHookContext,
  readStdin,
  RuleMatcher,
} from "@satoshibits/claude-skill-runtime";

import type {
  DebugLogger,
  PreToolMatch,
  PreToolUseOutput,
} from "@satoshibits/claude-skill-runtime";

interface PreToolUseHookInput {
  session_id: string;
  working_directory: string;
  tool_name: string;
  tool_input: string;
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
 * Build allow output with warnings (for "warn" enforcement)
 */
function buildAllowOutputWithWarnings(
  warnings: { skill: string; description: string; pattern?: string }[],
): PreToolUseOutput {
  if (warnings.length === 0) {
    // no warnings - return empty (allows tool to proceed)
    return {};
  }

  // format warnings as string for additionalContext
  const warningLines = warnings.map(
    (w) =>
      `- ${w.skill}: ${w.description}${w.pattern ? ` (pattern: ${w.pattern})` : ""}`,
  );
  const additionalContext = `=== GUARDRAIL WARNINGS ===\nThe following guardrails matched but are not blocking:\n${warningLines.join("\n")}`;

  return buildPreToolUseAllowOutput(additionalContext);
}

/**
 * Main PreToolUse hook
 */
async function main() {
  let logger: DebugLogger | null = null;

  try {
    const input = await readStdin();
    const data: PreToolUseHookInput = JSON.parse(input) as PreToolUseHookInput;

    const { session_id, working_directory, tool_name, tool_input } = data;

    // initialize hook context
    const {
      projectDir,
      configLoader,
      config,
      logger: contextLogger,
    } = initHookContext({
      workingDirectory: working_directory,
    });
    logger = contextLogger;

    logger.log("activation", "PreToolUse JSON hook started (v2.1 corrected)", {
      sessionId: session_id,
      toolName: tool_name,
      inputLength: tool_input.length,
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
      logger.log("activation", "allowing with warnings", {
        warningCount: warnings.length,
      });
    }

    const output = buildAllowOutputWithWarnings(warnings);
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
