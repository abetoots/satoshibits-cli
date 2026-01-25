#!/usr/bin/env node

/**
 * SessionStart hook for optimization
 *
 * Runs once at session start to:
 * 1. Perform initial workspace scan
 * 2. Establish baseline file state
 * 3. Pre-load skill metadata index
 *
 * This makes subsequent PostToolUse hooks faster by enabling delta-only scanning.
 */
import {
  handleHookError,
  initHookContext,
  readStdin,
  sessionState,
} from "@satoshibits/claude-skill-runtime";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import type {
  DebugLogger,
  SkillConfig,
} from "@satoshibits/claude-skill-runtime";

interface HookInput {
  session_id: string;
  working_directory: string;
}

interface FileState {
  version: string;
  timestamp: string;
  sessionId: string;
  modifiedFiles: string[];
  stagedFiles: string[];
  untrackedFiles: string[];
  skillIndex: Record<string, SkillMetadata>;
}

interface SkillMetadata {
  name: string;
  description: string;
  activationStrategy?: string;
  hasHooks: boolean;
  triggerCount: number;
}

/**
 * Get modified files from git
 */
function getGitModifiedFiles(projectDir: string): string[] {
  try {
    const result = execSync("git diff --name-only", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 5000,
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get staged files from git
 */
function getGitStagedFiles(projectDir: string): string[] {
  try {
    const result = execSync("git diff --cached --name-only", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 5000,
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get untracked files from git (limited to reasonable count)
 * Cross-platform: limits in JS instead of using shell pipe
 */
function getGitUntrackedFiles(projectDir: string): string[] {
  try {
    const result = execSync("git ls-files --others --exclude-standard", {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 5000,
    });
    // limit to first 100 untracked files to avoid performance issues
    return result.trim().split("\n").filter(Boolean).slice(0, 100);
  } catch {
    return [];
  }
}

/**
 * Build skill metadata index for fast lookups
 */
function buildSkillIndex(config: SkillConfig): Record<string, SkillMetadata> {
  const index: Record<string, SkillMetadata> = {};

  for (const [name, rule] of Object.entries(config.skills)) {
    // guard against null/invalid rules (nullish check only, preserves type)
    if (rule == null) {
      continue;
    }

    let triggerCount = 0;
    if (rule.promptTriggers?.keywords)
      triggerCount += rule.promptTriggers.keywords.length;
    if (rule.promptTriggers?.intentPatterns)
      triggerCount += rule.promptTriggers.intentPatterns.length;
    if (rule.fileTriggers?.pathPatterns)
      triggerCount += rule.fileTriggers.pathPatterns.length;
    if (rule.fileTriggers?.contentPatterns)
      triggerCount += rule.fileTriggers.contentPatterns.length;

    index[name] = {
      name,
      description: rule.description ?? "",
      activationStrategy: rule.activationStrategy,
      hasHooks: !!(rule.preToolTriggers ?? rule.stopTriggers),
      triggerCount,
    };
  }

  return index;
}

/**
 * Save file state to cache
 */
function saveFileState(cacheDir: string, state: FileState): void {
  const statePath = path.join(cacheDir, "file_state.json");

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Main session start hook
 */
async function main() {
  let logger: DebugLogger | null = null;
  const startTime = Date.now();

  try {
    // read input from stdin
    const input = await readStdin();
    const data: HookInput = JSON.parse(input) as HookInput;

    const { session_id, working_directory } = data;

    // initialize hook context
    const {
      projectDir,
      config,
      logger: contextLogger,
    } = initHookContext({
      workingDirectory: working_directory,
    });
    logger = contextLogger;
    const cacheDir = path.join(projectDir, ".claude", "cache");

    logger.log("activation", "SessionStart hook started", {
      sessionId: session_id,
      projectDir,
    });

    // perform initial workspace scan
    const modifiedFiles = getGitModifiedFiles(projectDir);
    const stagedFiles = getGitStagedFiles(projectDir);
    const untrackedFiles = getGitUntrackedFiles(projectDir);

    logger.log("state", "workspace scan complete", {
      modifiedCount: modifiedFiles.length,
      stagedCount: stagedFiles.length,
      untrackedCount: untrackedFiles.length,
    });

    // initialize session with baseline files
    for (const file of [...modifiedFiles, ...stagedFiles]) {
      sessionState.addModifiedFile(session_id, file);
    }

    // build skill metadata index
    const skillIndex = buildSkillIndex(config);
    const skillCount = Object.keys(skillIndex).length;

    logger.log("state", "skill index built", {
      skillCount,
      guaranteedCount: Object.values(skillIndex).filter(
        (s) => s.activationStrategy === "guaranteed",
      ).length,
    });

    // save file state for delta tracking
    const fileState: FileState = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      sessionId: session_id,
      modifiedFiles,
      stagedFiles,
      untrackedFiles,
      skillIndex,
    };

    saveFileState(cacheDir, fileState);

    logger.log("perf", "SessionStart complete", {
      totalDurationMs: Date.now() - startTime,
      cacheDir,
    });

    // output summary (not JSON - this is informational)
    console.log(`\n🚀 Skill system initialized`);
    console.log(`   ${skillCount} skills loaded`);
    if (modifiedFiles.length > 0) {
      console.log(`   ${modifiedFiles.length} modified files tracked`);
    }

    const guaranteedSkills = Object.values(skillIndex).filter(
      (s) => s.activationStrategy === "guaranteed",
    );
    if (guaranteedSkills.length > 0) {
      console.log(`   ${guaranteedSkills.length} guaranteed skills active`);
    }

    console.log("");

    process.exit(0);
  } catch (error) {
    // silent failure - don't block session start
    handleHookError(error, logger, { hookName: "SessionStart" });
    process.exit(0);
  }
}

// Run
// cjs-compatible entry point
main().catch(console.error);
