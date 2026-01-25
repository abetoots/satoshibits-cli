#!/usr/bin/env node
import {
  handleHookError,
  initHookContext,
  normalizeFilePath,
  readStdin,
  sessionState,
} from "@satoshibits/claude-skill-runtime";

import type { DebugLogger } from "@satoshibits/claude-skill-runtime";

interface ToolInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    edits?: { file_path: string }[];
  };
  session_id: string;
}

/**
 * Track file modifications to build session context
 */
async function main() {
  let logger: DebugLogger | null = null;

  try {
    const input = await readStdin();
    const data: ToolInput = JSON.parse(input) as ToolInput;

    const { tool_name, tool_input, session_id } = data;

    // initialize hook context
    const { projectDir, logger: contextLogger } = initHookContext({
      workingDirectory: process.cwd(),
    });
    logger = contextLogger;

    logger.log("io", "tool use received", {
      toolName: tool_name,
      sessionId: session_id,
    });

    // only track file-modifying operations
    if (!["Edit", "Write", "MultiEdit"].includes(tool_name)) {
      logger.log("io", "tool skipped (non-modifying)", { toolName: tool_name });
      process.exit(0);
    }

    // extract file path(s)
    const filePaths = extractFilePaths(tool_name, tool_input);
    logger.log("io", "file paths extracted", {
      toolName: tool_name,
      fileCount: filePaths.length,
      files: filePaths,
    });

    // normalize and update session state
    filePaths.forEach((filePath) => {
      const normalizedPath = normalizeFilePath(filePath, projectDir);
      sessionState.addModifiedFile(session_id, normalizedPath);
      logger?.log("state", "file tracked", {
        originalPath: filePath,
        normalizedPath,
      });
    });

    // increment tool use count for deterministic cleanup
    sessionState.incrementToolUseCount(session_id);

    // cleanup every 50 tool uses (deterministic)
    const toolUseCount = sessionState.getToolUseCount(session_id);
    if (toolUseCount % 50 === 0) {
      logger.log("state", "cleanup triggered", { toolUseCount });
      sessionState.cleanupOldSessions();
      sessionState.pruneStaleActivations(session_id, 3600000); // Prune activations >1hr old
    }

    process.exit(0);
  } catch (error) {
    // silent failure - don't block tool execution
    handleHookError(error, logger, { hookName: "PostToolUse" });
    process.exit(0);
  }
}

/**
 * Extract file paths from tool input
 */
function extractFilePaths(
  toolName: string,
  toolInput: ToolInput["tool_input"],
): string[] {
  if (toolName === "MultiEdit") {
    return toolInput.edits?.map((edit) => edit.file_path) ?? [];
  }

  return [toolInput.file_path].filter((path): path is string => Boolean(path));
}

// Run
// cjs-compatible entry point
main().catch(console.error);
