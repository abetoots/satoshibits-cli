/**
 * Debug Logger - structured logging for skill runtime debugging
 * Writes JSON logs to a rotatable log file
 */

import fs from 'fs';
import path from 'path';
import type { LogCategory, DebugLogger } from './types.mjs';

interface LoggerConfig {
  enabled: boolean;
  categories: LogCategory[] | null; // null = all categories
  logFile: string;
  maxFileSize: number;
}

/**
 * Debug logger implementation
 */
export class DebugLoggerImpl implements DebugLogger {
  private config: LoggerConfig;

  constructor(
    projectDir: string,
    enabled: boolean,
    categories?: LogCategory[]
  ) {
    this.config = {
      enabled,
      categories: categories?.length ? categories : null,
      logFile: path.join(projectDir, '.claude', 'cache', 'debug.log'),
      maxFileSize: 1024 * 1024, // 1MB
    };
  }

  log(category: LogCategory, message: string, data?: object): void {
    if (!this.config.enabled) return;
    if (this.config.categories && !this.config.categories.includes(category))
      return;

    const entry = JSON.stringify({
      ...data, // spread first so reserved keys take precedence
      t: new Date().toISOString(),
      pid: process.pid, // helps debug concurrent hooks
      cat: category,
      msg: message,
    });

    this.writeLogSafe(entry + '\n');
  }

  private writeLogSafe(line: string): void {
    try {
      // ensure directory exists
      const dir = path.dirname(this.config.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // try rotation first (may fail in race condition - that's ok)
      this.tryRotate();

      // append (atomic for small writes on POSIX)
      fs.appendFileSync(this.config.logFile, line);
    } catch {
      // silent fail - debug logging shouldn't break hooks
    }
  }

  private tryRotate(): void {
    try {
      const stats = fs.statSync(this.config.logFile);
      if (stats.size > this.config.maxFileSize) {
        const backup = this.config.logFile + '.1';
        try {
          fs.unlinkSync(backup);
        } catch {
          // may not exist
        }
        fs.renameSync(this.config.logFile, backup);
      }
    } catch {
      // file doesn't exist or rotation failed (race) - ignore
    }
  }
}

/**
 * No-op logger for when logging is disabled
 */
class NoopLogger implements DebugLogger {
  log(): void {
    // intentionally empty
  }
}

/**
 * Create a debug logger instance
 */
export function createLogger(
  projectDir: string,
  enabled: boolean,
  categories?: LogCategory[]
): DebugLogger {
  if (!enabled) {
    return new NoopLogger();
  }
  return new DebugLoggerImpl(projectDir, enabled, categories);
}

/**
 * Create a no-op logger (for when logging should be disabled)
 */
export function createNoopLogger(): DebugLogger {
  return new NoopLogger();
}
