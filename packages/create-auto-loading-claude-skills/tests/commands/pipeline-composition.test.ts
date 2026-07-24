/**
 * Composition test: sync → sync-status → validate → hook resolution.
 *
 * Every unit in this pipeline passed its own tests while the pipeline itself was broken:
 * `sync` wrote rules `validate` rejected as orphaned and the runtime could not load, and
 * `sync-status` reported "stale" immediately after a clean `sync`. Only an end-to-end
 * fixture catches that class of defect.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, "../../dist/src/bin/cli.js");
const HOOK = path.join(
  __dirname,
  "../../dist/src/templates/hooks/skill-activation-prompt.js",
);

const SKILL_MD = (name: string, keyword: string) => `---
name: ${name}
description: ${name} description
x-smart-triggers:
  activationStrategy: suggestive
  promptTriggers:
    keywords:
      - ${keyword}
---

# ${name}
`;

describe("sync → sync-status → validate → hook pipeline", () => {
  let projectDir: string;
  let homeDir: string;

  function run(args: string, cwd: string): { stdout: string; code: number } {
    const r = spawnSync("node", [CLI, ...args.split(" ")], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
    });
    return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), code: r.status ?? 1 };
  }

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-proj-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-home-"));
    fs.mkdirSync(path.join(homeDir, ".claude", "skills"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("a project skill survives the whole pipeline", () => {
    // authored in the documented location
    const dir = path.join(projectDir, ".claude", "skills", "proj-tool");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), SKILL_MD("proj-tool", "deploy"));

    run("sync", projectDir);
    // assert on the artifact, not the console summary
    expect(
      fs.readFileSync(
        path.join(projectDir, ".claude/skills/skill-rules.yaml"),
        "utf8",
      ),
    ).toContain("proj-tool");

    // sync-status must not report stale immediately after a clean sync
    const status = run("sync-status", projectDir);
    expect(status.code).toBe(0);

    // validate must not call the freshly-synced rule orphaned
    const validated = run("validate", projectDir);
    expect(validated.stdout).not.toContain("SKILL.md not found");
    expect(validated.code).toBe(0);

    // and the hook must actually resolve it
    const hook = spawnSync("node", [HOOK], {
      input: JSON.stringify({
        cwd: projectDir,
        session_id: "pipeline-1",
        hook_event_name: "UserPromptSubmit",
        prompt: "help me deploy",
      }),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        CLAUDE_PROJECT_DIR: undefined as unknown as string,
      },
    });
    expect(hook.stdout).toContain("proj-tool");
  });

  it("a personal skill survives the pipeline when synced from home", () => {
    const dir = path.join(homeDir, ".claude", "skills", "personal-tool");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      SKILL_MD("personal-tool", "personal"),
    );

    run("sync", homeDir);
    expect(
      fs.readFileSync(
        path.join(homeDir, ".claude/skills/skill-rules.yaml"),
        "utf8",
      ),
    ).toContain("personal-tool");

    const status = run("sync-status", homeDir);
    expect(status.code).toBe(0);

    const validated = run("validate", homeDir);
    expect(validated.code).toBe(0);

    // resolvable from an unrelated project via user scope
    const hook = spawnSync("node", [HOOK], {
      input: JSON.stringify({
        cwd: projectDir,
        session_id: "pipeline-2",
        hook_event_name: "UserPromptSubmit",
        prompt: "a personal matter",
      }),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        CLAUDE_PROJECT_DIR: undefined as unknown as string,
      },
    });
    expect(hook.stdout).toContain("personal-tool");
  });

  it("clears synced entries when the last SKILL.md is deleted, instead of deadlocking", () => {
    // sync used to return early on zero skill files, so a config whose skills were all
    // deleted stayed stale forever and `sync` refused to repair it
    const dir = path.join(projectDir, ".claude", "skills", "doomed");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), SKILL_MD("doomed", "deploy"));

    run("sync", projectDir);
    expect(run("sync-status", projectDir).code).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
    run("sync", projectDir);

    expect(
      fs.readFileSync(
        path.join(projectDir, ".claude/skills/skill-rules.yaml"),
        "utf8",
      ),
    ).not.toContain("doomed");
    expect(run("sync-status", projectDir).code).toBe(0);
  });

  it("drops personal entries an older release copied into a project config", () => {
    // migration: preserving them as "manual" would keep the shadowing bug alive
    fs.mkdirSync(path.join(projectDir, ".claude", "skills"), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/skill-rules.yaml"),
      `version: "2.0"
skills:
  personal-tool:
    type: domain
    enforcement: suggest
    priority: high
    description: "copied by an older sync"
    promptTriggers:
      keywords: [personal]
_sync:
  skillScopes:
    personal-tool: personal
`,
      "utf8",
    );

    run("sync", projectDir);

    expect(
      fs.readFileSync(
        path.join(projectDir, ".claude/skills/skill-rules.yaml"),
        "utf8",
      ),
    ).not.toContain("personal-tool");
  });

  it("syncing a project does not report personal skills as stale afterwards", () => {
    const personal = path.join(homeDir, ".claude", "skills", "personal-tool");
    fs.mkdirSync(personal, { recursive: true });
    fs.writeFileSync(
      path.join(personal, "SKILL.md"),
      SKILL_MD("personal-tool", "personal"),
    );
    const proj = path.join(projectDir, ".claude", "skills", "proj-tool");
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, "SKILL.md"), SKILL_MD("proj-tool", "deploy"));

    run("sync", projectDir);

    // the read path must apply the same scope filter as the write path
    const status = run("sync-status", projectDir);
    expect(status.code).toBe(0);
  });
});

describe("sync drop predicate is gated on file existence", () => {
  let projectDir: string;
  let homeDir: string;

  function run(args: string, cwd: string): { stdout: string; code: number } {
    const r = spawnSync("node", [CLI, ...args.split(" ")], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
    });
    return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), code: r.status ?? 1 };
  }

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "drop-proj-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "drop-home-"));
    fs.mkdirSync(path.join(homeDir, ".claude", "skills"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  function writeSkill(name: string, keyword: string): void {
    const dir = path.join(projectDir, ".claude", "skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name}\nx-smart-triggers:\n  activationStrategy: suggestive\n  promptTriggers:\n    keywords: [${keyword}]\n---\n\n# ${name}\n`,
    );
  }

  const rulesFile = () =>
    fs.readFileSync(
      path.join(projectDir, ".claude/skills/skill-rules.yaml"),
      "utf8",
    );

  it("preserves a rule whose SKILL.md still exists but failed to parse", () => {
    writeSkill("kept", "kept");
    writeSkill("broken", "broken");
    run("sync", projectDir);
    expect(rulesFile()).toContain("broken");

    // corrupt the frontmatter — the FILE still exists
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/broken/SKILL.md"),
      "not: [valid yaml\n",
    );
    const result = run("sync", projectDir);

    // not dropped, and not misdiagnosed as "SKILL.md no longer exists"
    expect(rulesFile()).toContain("broken");
    expect(result.stdout).not.toContain("no longer exists");
  });

  it("keeps a transiently-broken synced skill sync-owned, so a LATER deletion still drops it", () => {
    // regression: preserving a parse-error skill as "manual" dropped its scope metadata,
    // permanently defeating the stale-drop — a clean → corrupt → delete sequence left the
    // rule lingering forever
    writeSkill("survivor", "survivor");
    run("sync", projectDir);

    // corrupt (file present) — rule preserved, must stay sync-owned
    fs.writeFileSync(
      path.join(projectDir, ".claude/skills/survivor/SKILL.md"),
      "not: [valid yaml\n",
    );
    run("sync", projectDir);
    expect(rulesFile()).toContain("survivor");

    // now delete the file entirely — the drop must fire because scope was carried forward
    fs.rmSync(path.join(projectDir, ".claude/skills/survivor"), {
      recursive: true,
      force: true,
    });
    const result = run("sync", projectDir);

    expect(rulesFile()).not.toContain("survivor");
    expect(result.stdout).toContain("no longer exists");
  });

  it("drops a rule only when its SKILL.md is genuinely gone", () => {
    writeSkill("doomed", "doomed");
    run("sync", projectDir);
    expect(rulesFile()).toContain("doomed");

    fs.rmSync(path.join(projectDir, ".claude/skills/doomed"), {
      recursive: true,
      force: true,
    });
    const result = run("sync", projectDir);

    expect(rulesFile()).not.toContain("doomed");
    expect(result.stdout).toContain("no longer exists");
  });
});
