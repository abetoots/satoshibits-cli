#!/usr/bin/env node
import {
  ConfigLoader,
  handleHookError,
  initHookContext,
  readStdin,
  RuleMatcher,
  sessionState,
} from "@satoshibits/claude-skill-runtime";

import type {
  DebugLogger,
  ShadowMatch,
  SkillMatch,
} from "@satoshibits/claude-skill-runtime";

interface HookInput {
  prompt: string;
  session_id: string;
  working_directory: string;
}

/**
 * Main skill activation hook
 * Runs before Claude sees the user's prompt
 */
async function main() {
  let logger: DebugLogger | null = null;
  const startTime = Date.now();

  try {
    // read input from stdin
    const input = await readStdin();
    const data: HookInput = JSON.parse(input) as HookInput;

    const { prompt, session_id, working_directory } = data;

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

    // clear previous prompt's activations (feedback loop scoping)
    sessionState.clearCurrentPromptSkills(session_id);

    const skillCount = Object.keys(config.skills).length;
    logger.log("activation", "hook started", {
      sessionId: session_id,
      skillCount,
      promptLength: prompt.length,
    });

    // get session context
    const modifiedFiles = sessionState.getModifiedFiles(session_id);
    const activeDomains = sessionState.getActiveDomains(session_id);
    logger.log("state", "session context loaded", {
      modifiedFileCount: modifiedFiles.length,
      activeDomains,
    });

    // match rules
    const matchStartTime = Date.now();
    const matcher = new RuleMatcher(config, projectDir, logger);
    let matches = matcher.matchPrompt(prompt, modifiedFiles);
    logger.log("perf", "prompt matching completed", {
      durationMs: Date.now() - matchStartTime,
      matchCount: matches.length,
    });

    // match shadow triggers (for manual-only skill suggestions)
    const shadowMatches = matcher.matchShadowTriggers(prompt);
    logger.log("activation", "shadow trigger matching completed", {
      shadowMatchCount: shadowMatches.length,
    });

    // filter out recently activated skills (prevent spam)
    const recentActivationMinutes =
      config.settings?.thresholds?.recentActivationMinutes ?? 5;
    const recentActivationMs = recentActivationMinutes * 60 * 1000;
    const beforeFilterCount = matches.length;
    matches = matches.filter((match) => {
      const wasRecent = sessionState.wasRecentlyActivated(
        session_id,
        match.skillName,
        recentActivationMs,
      );
      if (wasRecent) {
        logger?.log("activation", "filtered recently activated", {
          skill: match.skillName,
          thresholdMinutes: recentActivationMinutes,
        });
      }
      return !wasRecent;
    });
    if (beforeFilterCount !== matches.length) {
      logger.log("activation", "recent activation filter applied", {
        before: beforeFilterCount,
        after: matches.length,
        filtered: beforeFilterCount - matches.length,
      });
    }

    // limit suggestions
    const maxSuggestions = config.settings?.maxSuggestions ?? 3;
    matches = matcher.limitMatches(matches, maxSuggestions);

    // check if we have any output to show
    const hasAutoLoadMatches = matches.length > 0;
    const hasShadowMatches = shadowMatches.length > 0;

    if (!hasAutoLoadMatches && !hasShadowMatches) {
      logger.log("activation", "no matches found, exiting", {
        totalDurationMs: Date.now() - startTime,
      });
      process.exit(0);
    }

    // record activations for auto-load matches
    matches.forEach((match) => {
      sessionState.recordSkillActivation(session_id, match.skillName);
      logger?.log("activation", "skill activated", {
        skill: match.skillName,
        score: match.score,
        priority: match.rule.priority,
        enforcement: match.rule.enforcement,
      });
    });

    logger.log("activation", "outputting suggestions", {
      autoLoadCount: matches.length,
      shadowCount: shadowMatches.length,
      skills: matches.map((m) => m.skillName),
      shadowSkills: shadowMatches.map((m) => m.skillName),
      totalDurationMs: Date.now() - startTime,
    });

    // format and output suggestions
    outputSuggestions(
      matches,
      shadowMatches,
      configLoader,
      activeDomains,
      logger,
    );

    process.exit(0);
  } catch (error) {
    // exit gracefully to not block Claude
    handleHookError(error, logger, {
      hookName: "SkillActivation",
      consoleErrorPrefix: "❌ Skill activation error",
    });
    process.exit(0);
  }
}

/**
 * Format and output skill suggestions
 */
function outputSuggestions(
  matches: SkillMatch[],
  shadowMatches: ShadowMatch[],
  configLoader: ConfigLoader,
  activeDomains: string[],
  logger: DebugLogger,
) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 SKILL ACTIVATION CHECK");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (activeDomains.length > 0) {
    console.log(`📁 Active Context: ${activeDomains.join(", ")}\n`);
  }

  // group by priority
  const critical = matches.filter((m) => m.rule.priority === "critical");
  const high = matches.filter((m) => m.rule.priority === "high");
  const medium = matches.filter((m) => m.rule.priority === "medium");
  const low = matches.filter((m) => m.rule.priority === "low");

  // handle blocking skills (critical with enforcement: block)
  const blockingSkills = critical.filter((m) => m.rule.enforcement === "block");
  if (blockingSkills.length > 0) {
    console.log("🔒 CRITICAL SKILLS (AUTO-LOADED):\n");

    for (const match of blockingSkills) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔒 AUTO-LOADED: ${match.skillName}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      console.log(`Reason: ${match.rule.description}`);
      console.log(`Enforcement: MANDATORY - Full skill content injected\n`);

      // inject full skill content
      const skillContent = configLoader.loadSkillContent(match.skillName);
      if (skillContent) {
        logger.log("activation", "skill auto-loaded", {
          skill: match.skillName,
          contentLength: skillContent.length,
        });
        console.log(skillContent);
        console.log("\n");
      } else {
        logger.log("error", "skill content not found", {
          skill: match.skillName,
        });
        console.log(
          `⚠️  Warning: Skill content not found for '${match.skillName}'\n`,
        );
      }
    }
  }

  // display warnings
  const warningSkills = matches.filter(
    (m) => m.rule.enforcement === "warn" && m.rule.priority !== "low",
  );
  if (warningSkills.length > 0) {
    console.log("⚠️  IMPORTANT WARNINGS:\n");
    warningSkills.forEach((match) => {
      console.log(`  ⚠️  ${match.skillName}`);
      console.log(`     ${match.rule.description}`);
    });
    console.log("");
  }

  // display high priority suggestions
  if (high.length > 0 && !high.every((m) => m.rule.enforcement === "block")) {
    console.log("📚 RECOMMENDED SKILLS:\n");
    high
      .filter((m) => m.rule.enforcement !== "block")
      .forEach((match) => {
        const matchReason =
          match.promptMatch && match.fileMatch
            ? "(prompt + files)"
            : match.promptMatch
              ? "(prompt)"
              : "(files)";
        console.log(`  → ${match.skillName} ${matchReason}`);
      });
    console.log("");
  }

  // display medium/low priority suggestions
  const otherSuggestions = [...medium, ...low].filter(
    (m) => m.rule.enforcement === "suggest",
  );
  if (otherSuggestions.length > 0) {
    console.log("💡 SUGGESTED SKILLS:\n");
    otherSuggestions.forEach((match) => {
      console.log(`  → ${match.skillName}`);
    });
    console.log("");
  }

  // display shadow trigger suggestions (manual-only skills)
  if (shadowMatches.length > 0) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💭 MANUAL SKILL SUGGESTIONS\n");
    console.log("The following manual-only skills might help:\n");

    shadowMatches.forEach((match) => {
      console.log(`  → ${match.skillName}`);
      console.log(`    ${match.rule.description}`);
      console.log(`    Reason: ${match.reason}`);
      console.log("");
    });

    console.log("To load: Use /<skill-name> or ask explicitly.\n");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// Run
// cjs-compatible entry point
main().catch(console.error);
