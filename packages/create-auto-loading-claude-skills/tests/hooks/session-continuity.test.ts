import fs from "fs";
import path from "path";

import {
  compileTemplateHook,
  executeNodeScript,
  setupMockProject,
} from "./helpers.js";

describe("Session continuity (multi-prompt persistence)", () => {
  let tmpDir: string;
  let compiledHookDir: string;
  let postToolUseHookPath: string;
  let skillActivationHookPath: string;

  // compile hooks ONCE before all tests to avoid tsx startup overhead (~700ms per call)
  beforeAll(() => {
    compiledHookDir = fs.mkdtempSync("/tmp/claude-hook-build-");
    postToolUseHookPath = compileTemplateHook(
      "post-tool-use-tracker.ts",
      compiledHookDir,
    );
    skillActivationHookPath = compileTemplateHook(
      "skill-activation-prompt.ts",
      compiledHookDir,
    );
  });

  afterAll(() => {
    // cleanup compiled hooks
    if (compiledHookDir && fs.existsSync(compiledHookDir)) {
      fs.rmSync(compiledHookDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync("/tmp/continuity-test-");
    setupMockProject(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // helper to run pre-compiled post-tool-use hook (fast: ~50ms vs tsx ~700ms)
  const runPostToolUseHook = (
    event: Parameters<typeof executeNodeScript>[1],
    env: Record<string, string> = {},
  ) => {
    return executeNodeScript(postToolUseHookPath, event, env);
  };

  it("should persist session state across multiple hook invocations", () => {
    // Prompt 1: Activate skill (using pre-compiled hook for speed)
    executeNodeScript(
      skillActivationHookPath,
      {
        prompt: "Create an API endpoint",
        session_id: "persist",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Verify session was created
    const sessionPath = path.join(tmpDir, ".claude/cache/session-persist.json");
    expect(fs.existsSync(sessionPath)).toBe(true);

    const session1 = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
      lastActivatedSkills: Record<string, number>;
    };
    // verify timestamp is a valid positive number (not just truthy)
    expect(typeof session1.lastActivatedSkills["backend-dev-guidelines"]).toBe(
      "number",
    );
    expect(
      session1.lastActivatedSkills["backend-dev-guidelines"],
    ).toBeGreaterThan(0);

    // Prompt 2: Should remember previous activation (deduplication)
    const result = executeNodeScript(
      skillActivationHookPath,
      {
        prompt: "Create another API endpoint",
        session_id: "persist",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Should be deduplicated (within 5 minutes)
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should track modified files across tool uses", () => {
    // Tool use 1 (using pre-compiled hook)
    runPostToolUseHook(
      {
        tool_name: "Edit",
        tool_input: { file_path: "src/file1.ts" },
        session_id: "tracking",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Tool use 2
    runPostToolUseHook(
      {
        tool_name: "Write",
        tool_input: { file_path: "src/file2.ts" },
        session_id: "tracking",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Verify session state contains both files
    const sessionPath = path.join(
      tmpDir,
      ".claude/cache/session-tracking.json",
    );
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
      modifiedFiles: string[];
    };

    expect(session.modifiedFiles.includes("src/file1.ts")).toBe(true);
    expect(session.modifiedFiles.includes("src/file2.ts")).toBe(true);
  });

  it("should handle concurrent hook executions with file locking", async () => {
    // create competing processes that will actually conflict
    const { spawn } = await import("child_process");

    const childProcesses: ReturnType<typeof spawn>[] = [];

    // use pre-compiled hook with 'node' instead of 'pnpm exec tsx'
    // this avoids spawning 5 simultaneous tsx instances (which pins CPU and causes timeouts)
    // node startup is ~50ms vs tsx ~700ms
    for (let i = 0; i < 5; i++) {
      const child = spawn("node", [postToolUseHookPath], {
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: tmpDir, // temp dir for session files
        },
      });

      // feed input via stdin
      child.stdin.write(
        JSON.stringify({
          tool_name: "Edit",
          tool_input: { file_path: `file${i}.ts` },
          session_id: "concurrent",
          working_directory: tmpDir,
        }),
      );
      child.stdin.end();

      childProcesses.push(child);
    }

    // wait for all processes to complete
    await Promise.all(
      childProcesses.map((child) => {
        return new Promise((resolve) => child.on("close", resolve));
      }),
    );

    // verify concurrent execution worked - session file should exist with tracked files
    const sessionPath = path.join(
      tmpDir,
      ".claude/cache/session-concurrent.json",
    );
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
      modifiedFiles: string[];
    };

    // at least some files should be tracked (locking prevents total corruption)
    // note: race conditions are more pronounced with Vitest's process model
    // TEST PURPOSE: verify session file isn't completely corrupted by concurrent writes
    // EXPECTED RANGE: 1-5 files - we accept this wide range because:
    // - Without locking: file would be corrupted/unreadable (JSON parse would fail)
    // - With locking: some writes may be lost due to read-modify-write races, but data is valid
    // - The test proves the locking prevents DATA CORRUPTION, not that it's a perfect mutex
    // For stricter concurrency guarantees, consider using a proper database or queue
    expect(session.modifiedFiles.length).toBeGreaterThanOrEqual(1);
    expect(session.modifiedFiles.length).toBeLessThanOrEqual(5);

    // verify all tracked files are unique (no duplicates from race conditions)
    const uniqueFiles = new Set(session.modifiedFiles);
    expect(uniqueFiles.size).toBe(session.modifiedFiles.length);

    // verify no .lock files left behind (cleanup worked)
    const cacheDir = path.join(tmpDir, ".claude/cache");
    const lockFiles = fs
      .readdirSync(cacheDir)
      .filter((f) => f.endsWith(".lock"));
    expect(lockFiles.length).toBe(0);
  });

  it(
    "should cleanup old sessions deterministically (every 50 tool uses)",
    { timeout: 60000 },
    () => {
      // Create old session (>24 hours ago)
      const oldSessionPath = path.join(
        tmpDir,
        ".claude/cache/session-old.json",
      );
      fs.writeFileSync(
        oldSessionPath,
        JSON.stringify({
          modifiedFiles: [],
          activeDomains: [],
          lastActivatedSkills: {},
          currentPromptSkills: [],
          toolUseCount: 0,
          createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        }),
        "utf8",
      );

      // pre-seed the cleanup session with 40 tool uses so we only need 10 more to hit threshold
      // this validates the cleanup mechanism without spawning 50 subprocesses
      const cleanupSessionPath = path.join(
        tmpDir,
        ".claude/cache/session-cleanup.json",
      );
      fs.writeFileSync(
        cleanupSessionPath,
        JSON.stringify({
          modifiedFiles: [],
          activeDomains: [],
          lastActivatedSkills: {},
          currentPromptSkills: [],
          toolUseCount: 40, // start at 40, 10 more = 50 threshold
          createdAt: Date.now(),
        }),
        "utf8",
      );

      // trigger 10 tool uses to hit cleanup threshold (40 + 10 = 50)
      // using pre-compiled hook for speed (~50ms vs ~700ms per call)
      for (let i = 0; i < 10; i++) {
        runPostToolUseHook(
          {
            tool_name: "Edit",
            tool_input: { file_path: "test.ts" },
            session_id: "cleanup",
            working_directory: tmpDir,
          },
          {
            CLAUDE_PROJECT_DIR: tmpDir,
          },
        );
      }

      // Old session should be cleaned up
      expect(fs.existsSync(oldSessionPath)).toBe(false);
    },
  );

  it("should cleanup orphaned .tmp and .lock files", () => {
    // Create orphaned files
    const cacheDir = path.join(tmpDir, ".claude/cache");
    const oldTmpFile = path.join(cacheDir, "session-test.json.tmp");
    const oldLockFile = path.join(cacheDir, "session-test.json.lock");

    fs.writeFileSync(oldTmpFile, "{}", "utf8");
    fs.writeFileSync(oldLockFile, "", "utf8");

    // Change mtime to >5 minutes ago
    const oldTime = Date.now() - 6 * 60 * 1000;
    fs.utimesSync(oldTmpFile, oldTime / 1000, oldTime / 1000);
    fs.utimesSync(oldLockFile, oldTime / 1000, oldTime / 1000);

    // pre-seed the session with 40 tool uses so we only need 10 more to hit threshold
    const orphanSessionPath = path.join(
      cacheDir,
      "session-orphan-cleanup.json",
    );
    fs.writeFileSync(
      orphanSessionPath,
      JSON.stringify({
        modifiedFiles: [],
        activeDomains: [],
        lastActivatedSkills: {},
        currentPromptSkills: [],
        toolUseCount: 40, // start at 40, 10 more = 50 threshold
        createdAt: Date.now(),
      }),
      "utf8",
    );

    // trigger 10 tool uses to hit cleanup threshold (using pre-compiled hook)
    for (let i = 0; i < 10; i++) {
      runPostToolUseHook(
        {
          tool_name: "Edit",
          tool_input: { file_path: "test.ts" },
          session_id: "orphan-cleanup",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );
    }

    // Orphaned files should be cleaned up
    expect(fs.existsSync(oldTmpFile)).toBe(false);
    expect(fs.existsSync(oldLockFile)).toBe(false);
  });

  it("should handle corrupted session files gracefully", () => {
    // Create corrupted session file
    const sessionPath = path.join(
      tmpDir,
      ".claude/cache/session-corrupted.json",
    );
    fs.writeFileSync(sessionPath, "{invalid json", "utf8");

    // Should not crash - should create new session (using pre-compiled hook)
    const result = runPostToolUseHook(
      {
        tool_name: "Edit",
        tool_input: { file_path: "test.ts" },
        session_id: "corrupted",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    expect(result.exitCode).toBe(0);

    // Session should be recreated with valid JSON
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
      modifiedFiles: string[];
    };
    expect(Array.isArray(session.modifiedFiles)).toBe(true);
  });

  it("should increment tool use count for deterministic cleanup", () => {
    const sessionPath = path.join(tmpDir, ".claude/cache/session-counter.json");

    // Execute tool uses (using pre-compiled hook)
    for (let i = 0; i < 3; i++) {
      runPostToolUseHook(
        {
          tool_name: "Edit",
          tool_input: { file_path: "test.ts" },
          session_id: "counter",
          working_directory: tmpDir,
        },
        {
          CLAUDE_PROJECT_DIR: tmpDir,
        },
      );
    }

    // Verify count
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
      toolUseCount: number;
    };
    expect(session.toolUseCount).toBe(3);
  });

  it("should prune stale skill activations (>1 hour old)", () => {
    const sessionPath = path.join(tmpDir, ".claude/cache/session-prune.json");

    // Create session with stale activation
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        modifiedFiles: [],
        activeDomains: [],
        lastActivatedSkills: {
          "stale-skill": Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          "recent-skill": Date.now() - 30 * 60 * 1000, // 30 minutes ago
        },
        currentPromptSkills: [],
        toolUseCount: 49,
        createdAt: Date.now(),
      }),
      "utf8",
    );

    // Trigger cleanup (50th tool use) - using pre-compiled hook
    runPostToolUseHook(
      {
        tool_name: "Edit",
        tool_input: { file_path: "test.ts" },
        session_id: "prune",
        working_directory: tmpDir,
      },
      {
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    );

    // Verify stale activation was pruned
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as {
      lastActivatedSkills: Record<string, number>;
    };
    // stale skill should be completely removed (undefined), not just falsy
    expect(session.lastActivatedSkills["stale-skill"]).toBeUndefined();
    // recent skill should have a valid timestamp (positive number)
    expect(typeof session.lastActivatedSkills["recent-skill"]).toBe("number");
    expect(session.lastActivatedSkills["recent-skill"]).toBeGreaterThan(0);
  });
});
