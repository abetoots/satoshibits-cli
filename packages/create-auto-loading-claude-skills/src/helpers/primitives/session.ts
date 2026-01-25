/**
 * Session primitive - provides read-only access to session state
 *
 * This is a thin wrapper around sessionState that provides a cleaner API
 * for validators to query session information.
 */

import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { sessionState } from '../internal/index.js';

export interface ModifiedFile {
  path: string;
  absolutePath: string;
  content: string;
  extension: string;
}

export interface Session {
  /**
   * Project directory (absolute path)
   */
  projectDir: string;

  /**
   * Check if a specific skill is activated in this session
   */
  isSkillActive(skillName: string): boolean;

  /**
   * Get all activated skills in this session
   */
  getActivatedSkills(): string[];

  /**
   * Get all modified files in this session with their content
   */
  getModifiedFiles(): ModifiedFile[];

  /**
   * Check if any files matching a pattern have been modified
   */
  hasModifiedFiles(pattern: RegExp | string): boolean;
}

/**
 * Create a Session instance for a given session ID and project directory
 */
export function createSession(sessionId: string, projectDir: string): Session {
  return {
    projectDir,

    isSkillActive(skillName: string): boolean {
      const activatedSkills = sessionState.getActivatedSkills(sessionId);
      return activatedSkills.includes(skillName);
    },

    getActivatedSkills(): string[] {
      return sessionState.getActivatedSkills(sessionId);
    },

    getModifiedFiles(): ModifiedFile[] {
      const paths = sessionState.getModifiedFiles(sessionId);

      return paths.map(path => {
        const absolutePath = join(projectDir, path);
        let content = '';

        try {
          content = readFileSync(absolutePath, 'utf-8');
        } catch (_error) {
          // file might have been deleted or is not readable
          if (process.env.DEBUG) {
            console.error(`[Session] Could not read file ${absolutePath}:`, _error);
          }
        }

        return {
          path,
          absolutePath,
          content,
          extension: extname(path)
        };
      });
    },

    hasModifiedFiles(pattern: RegExp | string): boolean {
      const paths = sessionState.getModifiedFiles(sessionId);

      if (typeof pattern === 'string') {
        // simple string matching
        return paths.some(file => file.includes(pattern));
      }

      // regex matching
      return paths.some(file => pattern.test(file));
    }
  };
}
