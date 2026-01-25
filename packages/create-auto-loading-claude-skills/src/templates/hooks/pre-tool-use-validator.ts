#!/usr/bin/env node
import {
  ConfigLoader,
  handleHookError,
  initHookContext,
  readStdin,
  RuleMatcher,
} from "@satoshibits/claude-skill-runtime";

import type {
  DebugLogger,
  PreToolMatch,
} from "@satoshibits/claude-skill-runtime";

interface PreToolUseHookInput {
  session_id: string;
  working_directory: string;
  tool_name: string;
  tool_input: string;
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

    logger.log("activation", "hook started", {
      sessionId: session_id,
      toolName: tool_name,
      inputLength: tool_input.length,
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
    console.log("🛑 TOOL EXECUTION BLOCKED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for (const match of blocking) {
      console.log(`❌ ${match.skillName} GUARDRAIL TRIGGERED`);
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
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // exit with error to potentially block the tool (depending on hook config)
    // process.exit(1); // uncomment to actually block
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
