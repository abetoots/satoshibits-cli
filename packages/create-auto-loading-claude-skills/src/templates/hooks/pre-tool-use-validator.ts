#!/usr/bin/env node
import {
  ConfigLoader,
  handleHookError,
  initHookContext,
  readStdin,
  resolveHookDir,
  RuleMatcher,
} from "@satoshibits/claude-skill-runtime";

import type {
  DebugLogger,
  PreToolMatch,
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
 * PreToolUse hook - Check pre-tool triggers before tool execution
 * Implements guardrails that should fire when Claude is about to use specific tools
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

    logger.log("activation", "hook started", {
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
      matches: matches.map((m) => ({
        skill: m.skillName,
        pattern: m.matchedPattern,
      })),
    });

    if (matches.length === 0) {
      logger.log("activation", "no matches, exiting");
      process.exit(0);
    }

    // output pre-tool suggestions/warnings
    outputPreToolSuggestions(matches, configLoader, logger);

    process.exit(0);
  } catch (error) {
    // silent failure - don't block tool execution
    handleHookError(error, logger, {
      hookName: "PreToolUse",
      debugOutput: true,
    });
    process.exit(0);
  }
}

/**
 * Format and output pre-tool suggestions
 */
function outputPreToolSuggestions(
  matches: PreToolMatch[],
  configLoader: ConfigLoader,
  logger: DebugLogger,
) {
  // separate by enforcement level
  const blocking = matches.filter((m) => m.rule.enforcement === "block");
  const warning = matches.filter((m) => m.rule.enforcement === "warn");
  const suggesting = matches.filter((m) => m.rule.enforcement === "suggest");

  // handle blocking guardrails
  if (blocking.length > 0) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  GUARDRAIL TRIGGERED (advisory — the tool still runs)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for (const match of blocking) {
      console.log(`❌ ${match.skillName} requirements not met`);
      console.log(`   ${match.rule.description}`);
      console.log(`   Tool: ${match.toolName}`);
      if (match.matchedPattern) {
        console.log(`   Pattern: ${match.matchedPattern}`);
      }
      console.log("");

      // inject skill content for guidance
      const skillContent = configLoader.loadSkillContent(match.skillName);
      if (skillContent) {
        logger.log("activation", "blocking skill loaded", {
          skill: match.skillName,
          contentLength: skillContent.length,
        });
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📖 ${match.skillName} REQUIREMENTS:`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        console.log(skillContent);
        console.log("");
      }
    }

    console.log(
      "⚠️  Please address the above requirements before proceeding.\n",
    );
    console.log(
      "   This hook is advisory: it prints and exits 0, so the tool is NOT blocked.\n" +
        "   Use skill-activation-json / pre-tool-use-validator-json for a real deny.\n",
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }

  // handle warnings
  if (warning.length > 0) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  PRE-TOOL WARNINGS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for (const match of warning) {
      console.log(`⚠️  ${match.skillName}`);
      console.log(`   ${match.rule.description}`);
      if (match.matchedPattern) {
        console.log(`   Matched: ${match.matchedPattern}`);
      }
      console.log("");

      // optionally inject skill content for guidance
      const skillContent = configLoader.loadSkillContent(match.skillName);
      if (skillContent) {
        logger.log("activation", "warning skill loaded", {
          skill: match.skillName,
          contentLength: skillContent.length,
        });
        console.log(`   📖 Consider reviewing: /${match.skillName}`);
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }

  // handle suggestions (non-intrusive)
  if (suggesting.length > 0) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💡 PRE-TOOL SUGGESTIONS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for (const match of suggesting) {
      console.log(`  → ${match.skillName}`);
      console.log(`    ${match.rule.description}`);
    }

    console.log("\nTo load a skill for guidance, use: /<skill-name>");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }
}

// Run
// cjs-compatible entry point
main().catch(console.error);
