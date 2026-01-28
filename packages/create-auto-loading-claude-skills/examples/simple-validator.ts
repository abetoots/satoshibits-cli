#!/usr/bin/env node
/**
 * Simple custom validator example
 *
 * This is a minimal example showing how to create a custom validator
 * using the helper package.
 */

import {
  createValidator,
  createSession,
  createUI,
  runValidators
} from '@satoshibits/create-auto-loading-claude-skills/helpers';

import { sessionState } from '@satoshibits/create-auto-loading-claude-skills/helpers/internal';

interface StopHookInput {
  session_id: string;
  working_directory: string;
}

/**
 * Example: Remind to run tests when code files are modified
 */
const testReminder = createValidator({
  name: 'test-reminder',
  description: 'Reminds to run tests when code is modified',

  validate: ({ session, ui }) => {
    const modifiedFiles = session.getModifiedFiles();

    // check if any TypeScript/JavaScript files were modified
    const codeFiles = modifiedFiles.filter(file =>
      /\.(ts|tsx|js|jsx)$/.test(file.path) && !file.path.includes('test')
    );

    if (codeFiles.length > 0) {
      for (const file of codeFiles) {
        ui.addReminder({
          message: 'Code files modified. Remember to run tests: npm test',
          priority: 'low',
          file: file.path
        });
      }
    }
  }
});

/**
 * Main hook entry point
 */
async function main() {
  try {
    const input = await readStdin();
    const data: StopHookInput = JSON.parse(input);

    const { session_id, working_directory } = data;
    const projectDir = process.env.CLAUDE_PROJECT_DIR || working_directory;

    sessionState.init(projectDir);

    const session = createSession(session_id, projectDir);
    const ui = createUI();

    // run validator
    await runValidators([testReminder], session, ui);

    // display reminders
    (ui as any)._flush();

    process.exit(0);
  } catch (error) {
    if (process.env.DEBUG) {
      console.error('Validator error:', error);
    }
    process.exit(0);
  }
}

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

main();
