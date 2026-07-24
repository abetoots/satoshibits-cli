#!/usr/bin/env node
import {
  handleHookError,
  initHookContext,
  readStdin,
  resolveHookDir,
  RuleMatcher,
  sessionState,
} from "@satoshibits/claude-skill-runtime";

import type { DebugLogger, StopMatch } from "@satoshibits/claude-skill-runtime";

interface StopHookInput {
  session_id: string;
  cwd?: string;
  working_directory?: string;
  stop_hook_active?: boolean;
  transcript_summary?: string;
}

/**
 * Stop hook - Validate modified files against activated skills' validation rules
 * Also handles stop triggers for verification skills
 */
async function main() {
  let logger: DebugLogger | null = null;

  try {
    const input = await readStdin();
    const data: StopHookInput = JSON.parse(input) as StopHookInput;

    const { session_id, transcript_summary } = data;

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

    // get session context
    const modifiedFiles = sessionState.getModifiedFiles(session_id);
    const activatedSkills = sessionState.getActivatedSkills(session_id);

    logger.log("validation", "stop hook started", {
      sessionId: session_id,
      modifiedFileCount: modifiedFiles.length,
      activatedSkillCount: activatedSkills.length,
      activatedSkills,
      hasTranscriptSummary: !!transcript_summary,
    });

    const matcher = new RuleMatcher(config, projectDir, logger);

    // check stop triggers if we have a transcript summary
    let stopTriggerMatches: StopMatch[] = [];
    if (transcript_summary) {
      stopTriggerMatches = matcher.matchStopTriggers(transcript_summary);
      logger.log("validation", "stop triggers evaluated", {
        matchCount: stopTriggerMatches.length,
        matches: stopTriggerMatches.map((m) => ({
          skill: m.skillName,
          keyword: m.matchedKeyword,
          requiresPromptEval: m.requiresPromptEvaluation,
        })),
      });
    }

    // apply validation rules from activated skills
    const reminders =
      modifiedFiles.length > 0 && activatedSkills.length > 0
        ? matcher.applyValidationRules(modifiedFiles, activatedSkills)
        : [];

    logger.log("validation", "validation complete", {
      reminderCount: reminders.length,
      reminders: reminders.map((r) => ({
        skill: r.skillName,
        rule: r.ruleName,
        failedFileCount: r.failedFiles.length,
      })),
    });

    // check if we have anything to output
    const hasReminders = reminders.length > 0;
    const hasStopTriggers = stopTriggerMatches.length > 0;

    if (!hasReminders && !hasStopTriggers) {
      logger.log("validation", "all checks passed");
      process.exit(0);
    }

    // output section header
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 CODE QUALITY SELF-CHECK");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // output stop trigger suggestions first (highest priority)
    if (hasStopTriggers) {
      console.log("🛑 COMPLETION VERIFICATION NEEDED:\n");

      for (const match of stopTriggerMatches) {
        console.log(`  ⚠️  ${match.skillName}`);
        console.log(`     ${match.rule.description}`);

        if (match.matchedKeyword) {
          console.log(`     Triggered by: "${match.matchedKeyword}"`);
        }

        if (match.requiresPromptEvaluation) {
          console.log(
            `     Note: This skill recommends additional verification.`,
          );

          // load and display the skill content for verification guidance
          const skillContent = configLoader.loadSkillContent(match.skillName);
          if (skillContent) {
            logger.log("validation", "stop trigger skill loaded", {
              skill: match.skillName,
              contentLength: skillContent.length,
            });
            console.log("");
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📖 ${match.skillName} GUIDELINES:`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
            console.log(skillContent);
            console.log("");
          }
        }

        console.log("");
      }
    }

    // output validation reminders
    if (hasReminders) {
      console.log("Based on activated skills, validation checks found:\n");

      // group reminders by skill
      const remindersBySkill = new Map<
        string,
        { ruleName: string; reminder: string; failedFiles: string[] }[]
      >();
      for (const { skillName, ruleName, reminder, failedFiles } of reminders) {
        if (!remindersBySkill.has(skillName)) {
          remindersBySkill.set(skillName, []);
        }
        remindersBySkill
          .get(skillName)!
          .push({ ruleName, reminder, failedFiles });
      }

      // display reminders with file-specific feedback
      for (const [skillName, skillReminders] of remindersBySkill) {
        console.log(`📚 ${skillName}:\n`);
        skillReminders.forEach(({ ruleName, reminder, failedFiles }) => {
          console.log(`   ❓ ${reminder}`);
          console.log(`      Rule: ${ruleName}`);
          console.log(`      Failed files (${failedFiles.length}):`);
          failedFiles.forEach((file) => {
            console.log(`        • ${file}`);
          });
          console.log("");
        });
      }
    }

    console.log(
      "💡 These are reminders, not blockers. Consider addressing them.\n",
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    process.exit(0);
  } catch (error) {
    // silent failure - don't block user workflow
    handleHookError(error, logger, { hookName: "Stop", debugOutput: true });
    process.exit(0);
  }
}

// Run
// cjs-compatible entry point
main().catch(console.error);
