#!/usr/bin/env node
/**
 * Example: Custom validations hook using the helper package
 *
 * This demonstrates how to:
 * 1. Use pre-built validators from the package
 * 2. Create custom validators using primitives
 * 3. Compose multiple validators in a stop hook
 *
 * USAGE:
 * 1. Copy this file to your project's .claude/hooks/ directory
 * 2. Configure in .claude/settings.json:
 *    {
 *      "hooks": {
 *        "stop": {
 *          "command": "node .claude/hooks/custom-validations.ts"
 *        }
 *      }
 *    }
 * 3. Install the package: npm install @satoshibits/create-auto-loading-claude-skills
 */
import {
  createSession,
  createUI,
  // Primitives for creating custom validators
  createValidator,
  runValidators,
  // Pre-built validators
  validators,
} from "@satoshibits/create-auto-loading-claude-skills/helpers";
// Import internal utilities for session state
import { sessionState } from "@satoshibits/create-auto-loading-claude-skills/helpers/internal";

interface StopHookInput {
  session_id: string;
  working_directory: string;
}

/**
 * Example 1: Using a pre-built validator
 */
const layeredArchValidator = validators.layeredArchitecture;

/**
 * Example 2: Custom validator - check for TODO comments
 */
const todoValidator = createValidator({
  name: "todo-checker",
  description: "Reminds about TODO comments in modified files",

  validate: ({ session, ui }) => {
    const modifiedFiles = session.getModifiedFiles();

    // only check TypeScript/JavaScript files
    const codeFiles = modifiedFiles.filter((modFile) =>
      /\.(ts|tsx|js|jsx)$/.test(modFile.path),
    );

    if (codeFiles.length === 0) return;

    // check for TODO comments in file content
    for (const modFile of codeFiles) {
      if (modFile.content.includes("TODO")) {
        ui.addReminder({
          message:
            "File contains TODO comments. Consider addressing them before committing.",
          priority: "low",
          file: modFile.path,
        });
      }
    }
  },
});

/**
 * Example 3: Custom validator - cross-skill validation
 * Only runs when specific skills are activated together
 */
const apiContractValidator = createValidator({
  name: "api-contract-checker",
  description:
    "Validates API contract consistency when frontend and backend are modified together",

  validate: ({ session, ui }) => {
    // check if both frontend and backend skills are active
    const frontendActive = session.isSkillActive("frontend-dev-guidelines");
    const backendActive = session.isSkillActive("backend-dev-guidelines");

    if (!frontendActive || !backendActive) {
      return; // skip if both aren't active
    }

    // check if API-related files were modified
    const hasApiFiles = session.hasModifiedFiles(/\/api\//);
    const hasComponentFiles = session.hasModifiedFiles(/\/components\//);

    if (hasApiFiles || hasComponentFiles) {
      ui.addReminder({
        message:
          "Both frontend and backend modified. Verify API contract consistency:\n" +
          "  • Are TypeScript types synchronized?\n" +
          "  • Are endpoint paths consistent?\n" +
          "  • Are request/response formats aligned?",
        priority: "medium",
      });
    }
  },
});

/**
 * Example 4: Custom validator - general pattern checking
 * Applies to any modified TypeScript file
 */
const noAnyTypesValidator = createValidator({
  name: "no-any-types",
  description: 'Reminds about "any" types in TypeScript files',

  validate: ({ session, ui }) => {
    const modifiedFiles = session.getModifiedFiles();

    const tsFiles = modifiedFiles.filter(
      (modFile) =>
        /\.tsx?$/.test(modFile.path) &&
        !modFile.path.includes("/node_modules/"),
    );

    if (tsFiles.length === 0) return;

    // check for "any" types in content
    for (const tsFile of tsFiles) {
      if (/:\s*any\b/.test(tsFile.content)) {
        ui.addReminder({
          message:
            'TypeScript file uses "any" types. Consider using specific types instead.\n' +
            "  • Use specific types or generics instead\n" +
            '  • Consider "unknown" for truly dynamic values\n' +
            "  • Run: npm run type-check",
          priority: "low",
          file: tsFile.path,
        });
      }
    }
  },
});

/**
 * Main hook entry point
 */
async function main() {
  try {
    // read input from stdin
    const input = await readStdin();
    const data: StopHookInput = JSON.parse(input);

    const { session_id, working_directory } = data;
    const projectDir = process.env.CLAUDE_PROJECT_DIR || working_directory;

    // initialize session state
    sessionState.init(projectDir);

    // create session and UI
    const session = createSession(session_id, projectDir);
    const ui = createUI();

    // run all validators
    await runValidators(
      [
        layeredArchValidator, // pre-built validator
        todoValidator, // custom validator
        apiContractValidator, // cross-skill validator
        noAnyTypesValidator, // pattern validator
      ],
      session,
      ui,
    );

    // flush reminders to stdout
    (ui as any)._flush();

    process.exit(0);
  } catch (error) {
    // silent failure - don't block user workflow
    if (process.env.DEBUG) {
      console.error("Custom validations error:", error);
    }
    process.exit(0);
  }
}

/**
 * Read from stdin
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

// Run
main();
