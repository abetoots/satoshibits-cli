#!/usr/bin/env node

/**
 * Skill activation hook with JSON output (v2.1 - CORRECTED)
 *
 * This hook outputs structured JSON per official HOOKS_REFERENCE_CLAUDE.md:
 * - additionalContext: STRING under hookSpecificOutput (not object at top level)
 * - decision: "block" or omitted (not "Proceed")
 * - updatedInput: NOT SUPPORTED for UserPromptSubmit
 *
 * Activation strategies:
 * - guaranteed: Inject skill content via additionalContext string
 * - suggestive: Add skill suggestions to additionalContext string
 * - native_only: Skip (let native handle)
 *
 * NOTE: prompt_enhanced has been REMOVED - native prompt hooks only support
 * Stop/SubagentStop with ok/block decisions, not skill activation decisions.
 */
import {
  formatSkillContextAsString,
  handleHookError,
  initHookContext,
  readStdin,
  RuleMatcher,
  sessionState,
} from "@satoshibits/claude-skill-runtime";

import type {
  DebugLogger,
  GuaranteedSkillInfo,
  HookShadowSuggestion,
  SkillContextInfo,
  SkillMatch,
  UserPromptSubmitOutput,
} from "@satoshibits/claude-skill-runtime";

interface HookInput {
  prompt: string;
  session_id: string;
  working_directory: string;
}

/**
 * Group matches by activation strategy
 */
function groupByStrategy(matches: SkillMatch[]): {
  guaranteed: SkillMatch[];
  suggestive: SkillMatch[];
  nativeOnly: SkillMatch[];
} {
  const result = {
    guaranteed: [] as SkillMatch[],
    suggestive: [] as SkillMatch[],
    nativeOnly: [] as SkillMatch[],
  };

  for (const match of matches) {
    const strategy = match.rule.activationStrategy ?? "native_only";
    switch (strategy) {
      case "guaranteed":
        result.guaranteed.push(match);
        break;
      case "suggestive":
        result.suggestive.push(match);
        break;
      // prompt_enhanced is no longer supported - treat as native_only
      case "prompt_enhanced":
      default:
        result.nativeOnly.push(match);
    }
  }

  return result;
}

/**
 * Check if cooldown applies to a skill
 */
function isCoolingDown(
  match: SkillMatch,
  sessionId: string,
  defaultCooldownMs: number,
): boolean {
  const cooldownMinutes = match.rule.cooldownMinutes;
  const cooldownMs = cooldownMinutes
    ? cooldownMinutes * 60 * 1000
    : defaultCooldownMs;

  return sessionState.wasRecentlyActivated(
    sessionId,
    match.skillName,
    cooldownMs,
  );
}

/**
 * Build structured JSON output based on activation strategies
 *
 * CORRECTED per HOOKS_REFERENCE_CLAUDE.md:
 * - additionalContext is a STRING under hookSpecificOutput
 * - decision is "block" or omitted (not "Proceed")
 * - updatedInput is NOT supported for UserPromptSubmit
 */
function buildOutput(
  guaranteedSkills: GuaranteedSkillInfo[],
  suggestiveHints: { skillName: string; description: string }[],
  shadowSuggestions: HookShadowSuggestion[],
  modifiedFiles: string[],
  activeDomains: string[],
): UserPromptSubmitOutput {
  const hasGuaranteed = guaranteedSkills.length > 0;
  const hasSuggestive = suggestiveHints.length > 0;
  const hasShadow = shadowSuggestions.length > 0;

  // if nothing to do, return empty (allows prompt to proceed)
  if (!hasGuaranteed && !hasSuggestive && !hasShadow) {
    return {};
  }

  // build skill context info
  const contextInfo: SkillContextInfo = {
    activated_by_reliability_engine: true,
  };

  if (hasGuaranteed) {
    contextInfo.guaranteed_skills = guaranteedSkills;
  }

  if (hasSuggestive) {
    contextInfo.suggested_skills = suggestiveHints.map((h) => ({
      name: h.skillName,
      description: h.description,
      reason: "Matched file/prompt triggers",
    }));
  }

  if (hasShadow) {
    contextInfo.shadow_suggestions = shadowSuggestions;
  }

  if (modifiedFiles.length > 0 || activeDomains.length > 0) {
    contextInfo.active_context = {
      modified_files: modifiedFiles,
      active_domains: activeDomains,
    };
  }

  // convert context info to string (per official spec)
  const contextString = formatSkillContextAsString(contextInfo);

  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: contextString,
    },
  };
}

/**
 * Main skill activation hook
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
    sessionState.clearCurrentPromptSkills(session_id);

    logger.log("activation", "JSON hook started (v2.1 corrected)", {
      sessionId: session_id,
      skillCount: Object.keys(config.skills).length,
      promptLength: prompt.length,
    });

    // get session context
    const modifiedFiles = sessionState.getModifiedFiles(session_id);
    const activeDomains = sessionState.getActiveDomains(session_id);

    // match rules
    const matcher = new RuleMatcher(config, projectDir, logger);
    let matches = matcher.matchPrompt(prompt, modifiedFiles);

    // match shadow triggers
    const shadowMatches = matcher.matchShadowTriggers(prompt);

    // apply cooldown filter
    const defaultCooldownMs =
      (config.settings?.thresholds?.recentActivationMinutes ?? 5) * 60 * 1000;

    matches = matches.filter(
      (m) => !isCoolingDown(m, session_id, defaultCooldownMs),
    );

    // filter out native_only BEFORE limiting - we "do nothing" for them
    // so they shouldn't consume slots that could go to guaranteed/suggestive
    matches = matches.filter(
      (m) => (m.rule.activationStrategy ?? "native_only") !== "native_only",
    );

    // limit suggestions (only applies to non-native_only matches now)
    const maxSuggestions = config.settings?.maxSuggestions ?? 3;
    matches = matcher.limitMatches(matches, maxSuggestions);

    // group by activation strategy
    const grouped = groupByStrategy(matches);

    logger.log("activation", "matches grouped by strategy", {
      guaranteed: grouped.guaranteed.length,
      suggestive: grouped.suggestive.length,
      nativeOnly: grouped.nativeOnly.length,
      shadow: shadowMatches.length,
    });

    // build guaranteed skills with content
    const guaranteedSkills: GuaranteedSkillInfo[] = [];
    for (const match of grouped.guaranteed) {
      const content = configLoader.loadSkillContent(match.skillName);
      if (content) {
        guaranteedSkills.push({
          name: match.skillName,
          description: match.rule.description,
          content,
          usage: `/${match.skillName}`,
        });
        sessionState.recordSkillActivation(session_id, match.skillName);
        logger.log("activation", "guaranteed skill loaded", {
          skill: match.skillName,
          contentLength: content.length,
        });
      }
    }

    // build suggestive hints
    const suggestiveHints = grouped.suggestive.map((m) => ({
      skillName: m.skillName,
      description: m.rule.description,
    }));

    // record suggestive activations
    grouped.suggestive.forEach((m) => {
      sessionState.recordSkillActivation(session_id, m.skillName);
    });

    // build shadow suggestions
    const shadowSuggestions: HookShadowSuggestion[] = shadowMatches.map(
      (m) => ({
        name: m.skillName,
        description: m.rule.description,
        reason: m.reason,
      }),
    );

    // build final output
    const output = buildOutput(
      guaranteedSkills,
      suggestiveHints,
      shadowSuggestions,
      modifiedFiles,
      activeDomains,
    );

    logger.log("activation", "JSON output built (corrected schema)", {
      hasGuaranteed: guaranteedSkills.length > 0,
      hasSuggestive: suggestiveHints.length > 0,
      hasShadow: shadowSuggestions.length > 0,
      hasOutput: !!output.hookSpecificOutput,
      totalDurationMs: Date.now() - startTime,
    });

    // output JSON to stdout
    console.log(JSON.stringify(output, null, 2));

    process.exit(0);
  } catch (error) {
    // on error, return empty output (allows prompt to proceed)
    // per official docs: don't block on errors
    handleHookError(error, logger, { hookName: "SkillActivationJSON" });
    console.log(JSON.stringify({}));
    process.exit(0);
  }
}

// Run
// cjs-compatible entry point
main().catch(console.error);
