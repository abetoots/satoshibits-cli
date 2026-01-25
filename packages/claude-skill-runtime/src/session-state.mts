/**
 * Session state manager with filesystem persistence
 * Enables state sharing across separate hook processes
 */

import { lockSync } from "proper-lockfile";
import fs from "fs";
import path from "path";

import type { DebugLogger, SessionData } from "./types.mjs";

class SessionState {
  private cacheDir: string;
  private logger: DebugLogger | null;

  constructor() {
    // cache directory will be set by hooks based on project dir
    this.cacheDir = "";
    this.logger = null;
  }

  /**
   * Initialize cache directory
   */
  init(projectDir: string, logger?: DebugLogger): void {
    this.cacheDir = path.join(projectDir, ".claude", "cache");
    this.logger = logger ?? null;

    // ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get session file path
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.cacheDir, `session-${sessionId}.json`);
  }

  /**
   * Normalize session data, patching missing fields with defaults
   * Handles backward compatibility for older session formats
   */
  private normalizeSession(session: Partial<SessionData>): SessionData {
    return {
      modifiedFiles: Array.isArray(session.modifiedFiles)
        ? session.modifiedFiles
        : [],
      activeDomains: Array.isArray(session.activeDomains)
        ? session.activeDomains
        : [],
      lastActivatedSkills:
        session.lastActivatedSkills &&
        typeof session.lastActivatedSkills === "object"
          ? session.lastActivatedSkills
          : {},
      currentPromptSkills: Array.isArray(session.currentPromptSkills)
        ? session.currentPromptSkills
        : [],
      toolUseCount:
        typeof session.toolUseCount === "number" ? session.toolUseCount : 0,
      createdAt:
        typeof session.createdAt === "number" ? session.createdAt : Date.now(),
    };
  }

  /**
   * Get or create session state (loads from disk)
   */
  getSession(sessionId: string): SessionData {
    const sessionPath = this.getSessionPath(sessionId);

    // try to load existing session from disk
    if (fs.existsSync(sessionPath)) {
      try {
        const content = fs.readFileSync(sessionPath, "utf8");
        const parsed = JSON.parse(content) as Partial<SessionData>;
        // normalize/patch missing fields for backward compatibility
        return this.normalizeSession(parsed);
      } catch {
        // if corrupted, create new session
        this.logger?.log("state", "session corrupted, creating new", {
          sessionId,
        });
        if (process.env.DEBUG) {
          console.warn(`Failed to load session ${sessionId}, creating new one`);
        }
      }
    }

    // create new session
    const newSession: SessionData = {
      modifiedFiles: [],
      activeDomains: [],
      lastActivatedSkills: {},
      currentPromptSkills: [],
      toolUseCount: 0,
      createdAt: Date.now(),
    };

    this.saveSession(sessionId, newSession);
    return newSession;
  }

  /**
   * Save session to disk (atomic write with file locking)
   */
  private saveSession(sessionId: string, session: SessionData): void {
    const sessionPath = this.getSessionPath(sessionId);
    const tempPath = `${sessionPath}.tmp`;

    // acquire exclusive lock (prevents concurrent writes)
    let release: (() => void) | null = null;

    try {
      // acquire lock with retry on ENOENT (race condition with cleanup)
      const acquireLock = (): (() => void) => {
        // create lock file if session doesn't exist yet
        if (!fs.existsSync(sessionPath)) {
          fs.writeFileSync(sessionPath, "{}", "utf8");
        }

        // acquire lock (sync API doesn't support retries)
        return lockSync(sessionPath, {
          stale: 5000, // lock expires after 5 seconds
        });
      };

      try {
        release = acquireLock();
      } catch (lockError) {
        // handle race condition: file deleted between check and lock
        if (
          lockError instanceof Error &&
          "code" in lockError &&
          lockError.code === "ENOENT"
        ) {
          // recreate file and retry once
          fs.writeFileSync(sessionPath, "{}", "utf8");
          release = acquireLock();
        } else {
          throw lockError;
        }
      }

      // write to temp file first (atomic operation)
      fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf8");

      // rename temp to final (atomic on most filesystems)
      fs.renameSync(tempPath, sessionPath);

      this.logger?.log("state", "session saved", { sessionId });
    } catch (error) {
      // cleanup temp file on error (use force to ignore ENOENT)
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // ignore cleanup errors
      }
      this.logger?.log("error", "failed to save session", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (process.env.DEBUG) {
        console.warn(`Failed to save session ${sessionId}:`, error);
      }
    } finally {
      // always release lock
      if (release) {
        try {
          release();
        } catch {
          // ignore unlock errors (lock may have expired)
        }
      }
    }
  }

  /**
   * Track file modification
   */
  addModifiedFile(sessionId: string, filePath: string): void {
    const session = this.getSession(sessionId);

    if (!session.modifiedFiles.includes(filePath)) {
      session.modifiedFiles.push(filePath);
    }

    // auto-detect domain from file path
    const domain = this.detectDomain(filePath);
    if (domain && !session.activeDomains.includes(domain)) {
      session.activeDomains.push(domain);
    }

    this.saveSession(sessionId, session);
    this.logger?.log("state", "file tracked", { sessionId, filePath, domain });
  }

  /**
   * Clear current prompt skills (called at start of UserPromptSubmit)
   */
  clearCurrentPromptSkills(sessionId: string): void {
    const session = this.getSession(sessionId);
    session.currentPromptSkills = [];
    this.saveSession(sessionId, session);
  }

  /**
   * Track skill activation for current prompt
   */
  recordSkillActivation(sessionId: string, skillName: string): void {
    const session = this.getSession(sessionId);

    // track in historical map for deduplication
    session.lastActivatedSkills[skillName] = Date.now();

    // track in current prompt list for validation
    if (!session.currentPromptSkills) {
      session.currentPromptSkills = []; // backward compatibility
    }
    if (!session.currentPromptSkills.includes(skillName)) {
      session.currentPromptSkills.push(skillName);
    }

    this.saveSession(sessionId, session);
    this.logger?.log("activation", "skill activated", { sessionId, skillName });
  }

  /**
   * Check if skill was recently activated (within threshold)
   */
  wasRecentlyActivated(
    sessionId: string,
    skillName: string,
    thresholdMs = 300000,
  ): boolean {
    const session = this.getSession(sessionId);
    const lastActivation = session.lastActivatedSkills[skillName];

    if (!lastActivation) return false;
    return Date.now() - lastActivation < thresholdMs;
  }

  /**
   * Get all modified files for session
   */
  getModifiedFiles(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return session.modifiedFiles;
  }

  /**
   * Get active domains for session
   */
  getActiveDomains(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return session.activeDomains;
  }

  /**
   * Get activated skills for validation (current prompt only)
   */
  getActivatedSkills(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return session.currentPromptSkills || [];
  }

  /**
   * Get all historical skill activations (for debugging)
   */
  getAllActivatedSkills(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return Object.keys(session.lastActivatedSkills);
  }

  /**
   * Increment tool use count for deterministic cleanup
   */
  incrementToolUseCount(sessionId: string): void {
    const session = this.getSession(sessionId);
    session.toolUseCount = (session.toolUseCount || 0) + 1;
    this.saveSession(sessionId, session);
  }

  /**
   * Get tool use count
   */
  getToolUseCount(sessionId: string): number {
    const session = this.getSession(sessionId);
    return session.toolUseCount || 0;
  }

  /**
   * Prune stale activations from session (activations older than threshold)
   */
  pruneStaleActivations(sessionId: string, maxAgeMs: number): void {
    const session = this.getSession(sessionId);
    const now = Date.now();

    for (const [skillName, timestamp] of Object.entries(
      session.lastActivatedSkills,
    )) {
      if (now - timestamp > maxAgeMs) {
        delete session.lastActivatedSkills[skillName];
      }
    }

    this.saveSession(sessionId, session);
  }

  /**
   * Detect domain from file path
   */
  private detectDomain(filePath: string): string | null {
    // normalize Windows paths to forward slashes for consistent matching
    const normalizedPath = filePath.replace(/\\/g, "/");

    const patterns: Record<string, RegExp> = {
      backend: /\b(backend|api|server|services)\/.*\.(ts|js)$/,
      frontend: /\b(frontend|web|client|components)\/.*\.(tsx|jsx)$/,
      testing: /\b(tests?|__tests__|spec)\/.*\.(test|spec)\.(ts|js)$/,
      database: /\b(migrations|prisma|db)\/.*\.(ts|js|sql)$/,
      devops: /\b(docker|k8s|terraform|ansible)\/.*/,
    };

    for (const [domain, pattern] of Object.entries(patterns)) {
      if (pattern.test(normalizedPath)) {
        return domain;
      }
    }

    return null;
  }

  /**
   * Clean up old sessions and orphaned temp files (called periodically)
   */
  cleanupOldSessions(maxAgeMs = 86400000): void {
    // 24 hours default
    if (!this.cacheDir || !fs.existsSync(this.cacheDir)) return;

    const now = Date.now();
    const files = fs.readdirSync(this.cacheDir);

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);

      // clean session-*.json files
      if (file.startsWith("session-") && file.endsWith(".json")) {
        try {
          const content = fs.readFileSync(filePath, "utf8");
          const session: SessionData = JSON.parse(content) as SessionData;

          // validate createdAt is a valid number before comparison
          if (
            Number.isFinite(session.createdAt) &&
            now - session.createdAt > maxAgeMs
          ) {
            fs.unlinkSync(filePath);
            this.logger?.log("state", "old session cleaned", { file });
            // also clean associated lock files
            try {
              fs.unlinkSync(`${filePath}.lock`);
            } catch {
              // lock file may not exist
            }
          }
        } catch {
          // if corrupted, try to delete it
          try {
            fs.unlinkSync(filePath);
          } catch {
            // file may have been deleted by another process
          }
        }
      }

      // clean orphaned .tmp files (>5 minutes old)
      if (file.endsWith(".tmp")) {
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > 300000) {
            // 5 minutes
            fs.unlinkSync(filePath);
          }
        } catch {
          // file may have been deleted already, or is corrupted
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore deletion errors
          }
        }
      }

      // clean orphaned .lock files (>5 minutes old)
      if (file.endsWith(".lock")) {
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > 300000) {
            // 5 minutes
            fs.unlinkSync(filePath);
          }
        } catch {
          // ignore errors
        }
      }
    }
  }
}

// singleton instance
export const sessionState = new SessionState();
