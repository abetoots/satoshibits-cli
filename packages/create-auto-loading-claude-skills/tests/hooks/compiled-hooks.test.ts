/**
 * Integration tests for pre-compiled JavaScript hooks
 *
 * These tests verify that:
 * 1. Compiled .js files exist in dist/
 * 2. No .ts files are shipped (clean build)
 * 3. Compiled hooks execute correctly with node
 *
 * IMPORTANT: Run `pnpm build` before running these tests
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { executeCompiledHook, setupMockProject } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distHooksDir = path.join(__dirname, "../../dist/src/templates/hooks");
// note: _internal directory is now in claude-skill-runtime package

describe("Compiled Hooks", () => {
  beforeAll(() => {
    // verify dist exists
    if (!fs.existsSync(distHooksDir)) {
      throw new Error(
        `dist/src/templates/hooks/ not found. Run 'pnpm build' first.`,
      );
    }
  });

  describe("Build output structure", () => {
    it("should have compiled .js hook files", () => {
      const expectedHooks = [
        "skill-activation-prompt.js",
        "post-tool-use-tracker.js",
        "stop-validator.js",
      ];

      for (const hook of expectedHooks) {
        const hookPath = path.join(distHooksDir, hook);
        expect(fs.existsSync(hookPath)).toBe(true);
      }
    });

    // note: _internal/*.js files are now in claude-skill-runtime package
    // the hooks import from the runtime package instead of local _internal/

    it("should NOT have .ts files in dist hooks directory", () => {
      const files = fs.readdirSync(distHooksDir);
      const tsFiles = files.filter(
        (f) => f.endsWith(".ts") && !f.endsWith(".d.ts"),
      );

      expect(tsFiles.length).toBe(0);
    });

    // note: _internal directory no longer exists in templates (moved to claude-skill-runtime)

    it("should NOT have tsconfig.json in dist hooks directory", () => {
      const tsconfigPath = path.join(distHooksDir, "tsconfig.json");
      expect(fs.existsSync(tsconfigPath)).toBe(false);
    });
  });

  describe("Compiled hook execution", () => {
    let tmpDir: string;

    beforeAll(() => {
      // create temp directory for test project
      tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".test-compiled-"));
      setupMockProject(tmpDir);
    });

    it("should execute skill-activation-prompt.js with node", () => {
      const result = executeCompiledHook(
        "skill-activation-prompt.ts", // helper converts to .js
        {
          prompt: "Create an API endpoint",
          session_id: "compiled-test-1",
          working_directory: tmpDir,
        },
      );

      // should not crash (exit code 0)
      expect(result.exitCode).toBe(0);

      // hook should produce no stderr errors
      expect(result.stderr).toBe("");

      // hook outputs formatted text (not JSON) when skills match,
      // or empty output when no skills match - both are valid
      // verify: if output exists, it should contain skill-related content
      if (result.stdout.trim()) {
        expect(
          result.stdout.includes("SKILL") ||
            result.stdout.includes("backend-dev") ||
            result.stdout.includes("---"),
        ).toBe(true);
      }
    });

    it("should execute post-tool-use-tracker.js with node", () => {
      const result = executeCompiledHook(
        "post-tool-use-tracker.ts", // helper converts to .js
        {
          session_id: "compiled-test-2",
          working_directory: tmpDir,
          tool_name: "Edit",
          tool_input: { file_path: "/test/file.ts" },
        },
      );

      // should not crash
      expect(result.exitCode).toBe(0);

      // hook should produce no stderr errors
      expect(result.stderr).toBe("");

      // stdout may be empty or contain output
      expect(typeof result.stdout).toBe("string");
    });

    it("should execute stop-validator.js with node", () => {
      const result = executeCompiledHook(
        "stop-validator.ts", // helper converts to .js
        {
          session_id: "compiled-test-3",
          working_directory: tmpDir,
        },
      );

      // should not crash
      expect(result.exitCode).toBe(0);

      // hook should produce no stderr errors
      expect(result.stderr).toBe("");

      // stdout may be empty or contain output
      expect(typeof result.stdout).toBe("string");
    });

    afterAll(() => {
      // cleanup temp directory
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

/**
 * Regression: current Claude Code sends `cwd`, not `working_directory`.
 *
 * These assertions deliberately check OBSERVABLE OUTPUT, not just `exitCode === 0`.
 * Every hook catches its errors and exits 0 by design (fail-open), and most print
 * nothing on failure — so "did not crash" is satisfied by a hook that resolved no
 * config and did nothing at all. Each hook below is paired with a negative control
 * (no directory field, no CLAUDE_PROJECT_DIR) proving the assertion is actually
 * sensitive to directory resolution.
 */
describe("Hook payload compatibility (cwd vs working_directory)", () => {
  let tmpDir: string;
  // a guaranteed-empty dir for negative controls, so "resolved nothing" is asserted
  // against a dir with no .claude/skills — not against the ambient process.cwd()
  let bareCwd: string;

  /** Rules exercising each hook family, so every hook has something observable to emit. */
  const RULES = `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  backend-dev-guidelines:
    type: domain
    enforcement: suggest
    priority: high
    activationStrategy: suggestive
    description: "Backend API patterns"
    promptTriggers:
      keywords:
        - API
        - endpoint
  bash-guard:
    type: guardrail
    enforcement: warn
    priority: critical
    activationStrategy: suggestive
    description: "Dangerous shell commands"
    preToolTriggers:
      toolName: Bash
      inputPatterns:
        - "rm -rf"
  completion-check:
    type: workflow
    enforcement: suggest
    priority: high
    activationStrategy: suggestive
    description: "Verify before claiming done"
    stopTriggers:
      keywords:
        - all tests pass
`;

  function skillFile(name: string): void {
    const dir = path.join(tmpDir, ".claude/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: test\n---\n\n# ${name}\n`,
      "utf8",
    );
  }

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".test-cwd-payload-"));
    fs.mkdirSync(path.join(tmpDir, ".claude/cache"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".claude/skills"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude/skills/skill-rules.yaml"),
      RULES,
      "utf8",
    );
    ["backend-dev-guidelines", "bash-guard", "completion-check"].forEach(skillFile);
    bareCwd = fs.mkdtempSync(path.join(os.tmpdir(), "bare-cwd-"));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    if (bareCwd && fs.existsSync(bareCwd)) {
      fs.rmSync(bareCwd, { recursive: true, force: true });
    }
  });

  const NO_PROJECT_DIR = { CLAUDE_PROJECT_DIR: undefined };

  /**
   * Each case states what the hook must OBSERVABLY do once it has resolved the config.
   * `dir` is spread into the payload so the same expectation can be driven through
   * `cwd`, through legacy `working_directory`, and through neither.
   */
  const CASES: {
    hook: string;
    payload: (dir: Record<string, string>) => Record<string, unknown>;
    observed: (r: { stdout: string }) => boolean;
    what: string;
  }[] = [
    {
      hook: "skill-activation-prompt.ts",
      what: "suggests the matching skill",
      payload: (dir) => ({
        ...dir,
        session_id: "obs-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "Create an API endpoint for users",
      }),
      observed: (r) => r.stdout.includes("backend-dev-guidelines"),
    },
    {
      hook: "skill-activation-json.ts",
      what: "emits additionalContext naming the skill",
      payload: (dir) => ({
        ...dir,
        session_id: "obs-2",
        hook_event_name: "UserPromptSubmit",
        prompt: "Create an API endpoint for users",
      }),
      observed: (r) => r.stdout.includes("backend-dev-guidelines"),
    },
    {
      hook: "pre-tool-use-validator.ts",
      what: "matches a preToolTriggers rule against object tool_input",
      payload: (dir) => ({
        ...dir,
        session_id: "obs-3",
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/x", description: "cleanup" },
      }),
      observed: (r) => r.stdout.includes("bash-guard"),
    },
    {
      hook: "pre-tool-use-validator-json.ts",
      what: "matches a preToolTriggers rule against object tool_input",
      payload: (dir) => ({
        ...dir,
        session_id: "obs-4",
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/x", description: "cleanup" },
      }),
      observed: (r) => r.stdout.includes("bash-guard"),
    },
    {
      hook: "stop-validator.ts",
      what: "raises the completion self-check",
      payload: (dir) => ({
        ...dir,
        session_id: "obs-5",
        transcript_summary: "all tests pass, we are done here",
      }),
      observed: (r) => r.stdout.includes("completion-check"),
    },
    {
      hook: "session-start.ts",
      what: "reports the skills it loaded",
      payload: (dir) => ({ ...dir, session_id: "obs-6" }),
      observed: (r) => r.stdout.includes("3 skills loaded"),
    },
  ];

  describe.each(CASES)("$hook", ({ hook, payload, observed, what }) => {
    it(`${what} — cwd payload`, () => {
      const result = executeCompiledHook(
        hook,
        { ...payload({ cwd: tmpDir }), session_id: `${hook}-cwd` } as never,
        NO_PROJECT_DIR,
      );
      expect(result.stderr).toBe("");
      expect(observed(result)).toBe(true);
    });

    it(`${what} — legacy working_directory payload`, () => {
      const result = executeCompiledHook(
        hook,
        {
          ...payload({ working_directory: tmpDir }),
          session_id: `${hook}-legacy`,
        } as never,
        NO_PROJECT_DIR,
      );
      expect(result.stderr).toBe("");
      expect(observed(result)).toBe(true);
    });

    it("negative control: emits nothing when the resolved dir has no rules", () => {
      // proves the assertions above depend on resolution rather than passing vacuously.
      // Pin the child cwd to a guaranteed-empty dir so the fallback resolves THERE — not
      // to the ambient process.cwd(), which the assertion would otherwise silently depend on.
      const result = executeCompiledHook(
        hook,
        { ...payload({}), session_id: `${hook}-none` } as never,
        NO_PROJECT_DIR,
        bareCwd,
      );
      expect(observed(result)).toBe(false);
    });
  });

  it("post-tool-use-tracker records the edited file under the resolved project dir", () => {
    const edited = path.join(tmpDir, "src/api/users.ts");
    const result = executeCompiledHook(
      "post-tool-use-tracker.ts",
      {
        cwd: tmpDir,
        session_id: "obs-tracker",
        tool_name: "Edit",
        tool_input: { file_path: edited },
      } as never,
      NO_PROJECT_DIR,
    );

    expect(result.stderr).toBe("");
    // the observable effect is state written under the RESOLVED directory
    const cacheDir = path.join(tmpDir, ".claude/cache");
    const written = fs
      .readdirSync(cacheDir)
      .filter((f) => f.includes("obs-tracker"));
    expect(written.length).toBeGreaterThan(0);
    const state = fs.readFileSync(path.join(cacheDir, written[0]!), "utf8");
    expect(state).toContain("users.ts");
  });

  it("CLAUDE_PROJECT_DIR still wins over the payload when both are present", () => {
    // documents the real production precedence: Claude Code always sets this env var,
    // so the payload fields are the fallback path, not the primary one
    const result = executeCompiledHook(
      "skill-activation-prompt.ts",
      {
        cwd: "/nonexistent-dir-that-has-no-rules",
        session_id: "obs-precedence",
        hook_event_name: "UserPromptSubmit",
        prompt: "Create an API endpoint for users",
      } as never,
      { CLAUDE_PROJECT_DIR: tmpDir },
    );

    expect(result.stdout).toContain("backend-dev-guidelines");
  });
});

/**
 * End-to-end coverage for user scope through the SHIPPED hooks.
 *
 * The unit tests pin ConfigLoader; these pin the composed path that actually runs in a
 * session — payload -> initHookContext -> ConfigLoader(userScope) -> printed output.
 * That composed path is the one that could leak a private file into Claude's context.
 */
describe("user scope through shipped hooks", () => {
  let projectDir: string;
  let homeDir: string;

  const RULE = (name: string, keyword: string) => `version: "1.0"
skills:
  ${name}:
    type: domain
    enforcement: suggest
    priority: high
    activationStrategy: suggestive
    description: "${name}"
    promptTriggers:
      keywords:
        - ${keyword}
`;

  function writeSkill(root: string, name: string, body: string): void {
    const dir = path.join(root, ".claude/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), body, "utf8");
  }

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "userscope-proj-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "userscope-home-"));
    fs.mkdirSync(path.join(projectDir, ".claude/skills"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".claude/skills"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("suggests a USER-scope skill through the shipped hook", () => {
    fs.writeFileSync(
      path.join(homeDir, ".claude/skills/skill-rules.yaml"),
      RULE("user-only-skill", "deploy"),
      "utf8",
    );
    writeSkill(homeDir, "user-only-skill", "# user only\n");

    const result = executeCompiledHook(
      "skill-activation-prompt.ts",
      {
        cwd: projectDir,
        session_id: "userscope-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "help me deploy this",
      } as never,
      { CLAUDE_PROJECT_DIR: undefined, HOME: homeDir, USERPROFILE: homeDir },
    );

    // fails if userScope is dropped from the template
    expect(result.stdout).toContain("user-only-skill");
  });

  it("does NOT read a user-scope SKILL.md that only the PROJECT rules name", () => {
    // The untrusted-repo scenario: a cloned project's rules claim a skill whose file only
    // exists under $HOME. `guaranteed` is required here — that is the strategy which
    // injects file CONTENT; a `suggestive` rule only ever prints the description, so the
    // assertion would hold even with the vulnerability present.
    writeSkill(homeDir, "private-notes", "# TOPSECRET user content\n");
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/skill-rules.yaml"),
      `version: "1.0"
skills:
  private-notes:
    type: domain
    enforcement: suggest
    priority: high
    activationStrategy: guaranteed
    description: "claimed by an untrusted project config"
    promptTriggers:
      keywords:
        - anything
`,
      "utf8",
    );

    const result = executeCompiledHook(
      "skill-activation-json.ts",
      {
        cwd: projectDir,
        session_id: "userscope-2",
        hook_event_name: "UserPromptSubmit",
        prompt: "anything at all",
      } as never,
      { CLAUDE_PROJECT_DIR: undefined, HOME: homeDir, USERPROFILE: homeDir },
    );

    expect(result.stdout).not.toContain("TOPSECRET");
  });

  it("DOES inject content for a guaranteed skill the user declared (control)", () => {
    // proves the assertion above is not passing merely because content injection is off
    fs.writeFileSync(
      path.join(homeDir, ".claude/skills/skill-rules.yaml"),
      `version: "1.0"
skills:
  user-guaranteed:
    type: domain
    enforcement: suggest
    priority: high
    activationStrategy: guaranteed
    description: "declared by the user"
    promptTriggers:
      keywords:
        - anything
`,
      "utf8",
    );
    writeSkill(homeDir, "user-guaranteed", "# LEGITIMATE user content\n");

    const result = executeCompiledHook(
      "skill-activation-json.ts",
      {
        cwd: projectDir,
        session_id: "userscope-4",
        hook_event_name: "UserPromptSubmit",
        prompt: "anything at all",
      } as never,
      { CLAUDE_PROJECT_DIR: undefined, HOME: homeDir, USERPROFILE: homeDir },
    );

    expect(result.stdout).toContain("LEGITIMATE user content");
  });

  it("project rules win over user rules of the same name", () => {
    // `guaranteed` + the json hook injects CONTENT, so the two copies are
    // distinguishable — asserting the shared NAME could not tell the scopes apart
    const RULE_GUARANTEED = `version: "1.0"
skills:
  shared:
    type: domain
    enforcement: suggest
    priority: high
    activationStrategy: guaranteed
    description: "shared"
    promptTriggers:
      keywords:
        - deploy
`;
    fs.writeFileSync(
      path.join(homeDir, ".claude/skills/skill-rules.yaml"),
      RULE_GUARANTEED,
      "utf8",
    );
    writeSkill(homeDir, "shared", "# USERCOPY\n");
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/skill-rules.yaml"),
      RULE_GUARANTEED,
      "utf8",
    );
    writeSkill(projectDir, "shared", "# PROJECTCOPY\n");

    const result = executeCompiledHook(
      "skill-activation-json.ts",
      {
        cwd: projectDir,
        session_id: "userscope-3",
        hook_event_name: "UserPromptSubmit",
        prompt: "help me deploy this",
      } as never,
      { CLAUDE_PROJECT_DIR: undefined, HOME: homeDir, USERPROFILE: homeDir },
    );

    expect(result.stdout).toContain("PROJECTCOPY");
    expect(result.stdout).not.toContain("USERCOPY");
  });
});

/**
 * Security regression: a `warn`-enforcement guardrail must INFORM without granting the
 * tool call. It previously routed through an "allow" builder, so the moment `inputPatterns`
 * actually matched object `tool_input`, a warning silently authorized the tool.
 */
describe("warn enforcement does not grant permission", () => {
  let projectDir: string;
  let homeDir: string;

  const WARN_RULES = `version: "1.0"
skills:
  warnguard:
    type: guardrail
    enforcement: warn
    priority: high
    activationStrategy: suggestive
    description: "warns on rm -rf"
    preToolTriggers:
      toolName: Bash
      inputPatterns:
        - "rm -rf"
`;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "warn-proj-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "warn-home-"));
    fs.mkdirSync(path.join(homeDir, ".claude", "skills"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, ".claude", "skills", "warnguard"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/warnguard/SKILL.md"),
      "---\nname: warnguard\ndescription: warns\n---\n# warnguard\n",
    );
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/skill-rules.yaml"),
      WARN_RULES,
    );
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("emits additionalContext with NO permissionDecision on a matching warn rule", () => {
    const result = executeCompiledHook(
      "pre-tool-use-validator-json.ts",
      {
        cwd: projectDir,
        session_id: "warn-1",
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/x", description: "cleanup" },
      } as never,
      { CLAUDE_PROJECT_DIR: undefined, HOME: homeDir, USERPROFILE: homeDir },
    );

    // the guardrail fired (matched the object tool_input)...
    expect(result.stdout).toContain("warnguard");
    // ...but must NOT have granted permission
    const payload = JSON.parse(result.stdout || "{}") as {
      hookSpecificOutput?: { permissionDecision?: string };
    };
    expect(payload.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(result.stdout).not.toContain('"allow"');
  });
});
