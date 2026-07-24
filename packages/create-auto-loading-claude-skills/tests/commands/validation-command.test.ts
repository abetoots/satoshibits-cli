/**
 * Tests for the validate command
 * Tests YAML parsing, rule validation, and fix capabilities
 */

import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// path to compiled CLI (built with tsc)
// using compiled CLI instead of tsx avoids ~700ms startup overhead per call
const COMPILED_CLI_PATH = path.join(__dirname, "../../dist/src/bin/cli.js");

describe("Validate command", () => {
  let tmpDir: string;
  let claudeDir: string;
  let skillsDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();

    // ensure CLI is built before running tests
    if (!fs.existsSync(COMPILED_CLI_PATH)) {
      throw new Error(
        `Compiled CLI not found at ${COMPILED_CLI_PATH}. Run 'pnpm build' first.`
      );
    }
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync("/tmp/validate-test-");
    claudeDir = path.join(tmpDir, ".claude");
    skillsDir = path.join(claudeDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI validate command
   * Uses compiled CLI for performance (~50ms vs ~700ms with tsx)
   */
  function runValidate(options = ""): {
    stdout: string;
    stderr: string;
    exitCode: number;
  } {
    try {
      const stdout = execSync(`node "${COMPILED_CLI_PATH}" validate ${options}`, {
        cwd: tmpDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (_error) {
      const execError = _error as { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        exitCode: execError.status ?? 1,
      };
    }
  }

  describe("Valid configurations", () => {
    /** A rule is only valid if its SKILL.md exists — otherwise it is an orphan. */
    function createSkillFile(name: string): void {
      fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`,
        "utf8",
      );
    }

    it("should validate a correct skill-rules.yaml", () => {
      createSkillFile("error-handling");
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        // all four schema-required fields present — this fixture previously omitted
        // enforcement and description, so it was never actually a "correct" config
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  error-handling:
    type: domain
    enforcement: suggest
    priority: high
    description: "Error handling patterns"
    promptTriggers:
      keywords: [error, exception]
`,
        "utf8",
      );

      const result = runValidate();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("1 valid skill(s)");
    });

    it("should validate skill-rules.json", () => {
      createSkillFile("api-design");
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.json"),
        JSON.stringify(
          {
            version: "1.0",
            settings: { maxSuggestions: 3 },
            skills: {
              "api-design": {
                type: "domain",
                enforcement: "suggest",
                priority: "medium",
                description: "API design patterns",
                promptTriggers: { keywords: ["API", "endpoint"] },
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = runValidate();
      expect(result.exitCode).toBe(0);
    });
  });

  describe("Invalid configurations", () => {
    it("should detect orphaned skills (in rules but missing SKILL.md)", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  missing-skill:
    type: domain
    priority: high
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate();
      // assert the DIAGNOSIS, not the skill's name — the old disjunction passed on
      // `includes("missing-skill")`, which any mention of the rule satisfies
      expect(result.stdout).toContain(
        "Referenced in skill-rules but SKILL.md not found",
      );
      expect(result.exitCode).not.toBe(0);
    });

    it("should detect invalid YAML syntax", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  bad-indent:
  type: domain  # wrong indentation
    priority: high
`,
        "utf8",
      );

      const result = runValidate();
      // invalid YAML should produce either a non-zero exit code or an error message
      const hasError =
        result.exitCode !== 0 ||
        result.stderr.toLowerCase().includes("error") ||
        result.stdout.toLowerCase().includes("error") ||
        result.stdout.toLowerCase().includes("invalid");
      expect(hasError).toBe(true);
    });

    it("should detect unregistered skills (SKILL.md exists but not in rules)", () => {
      // create skill-rules without the skill
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills: {}
`,
        "utf8",
      );

      // create unregistered skill directory with SKILL.md
      const unregSkillDir = path.join(skillsDir, "unregistered-skill");
      fs.mkdirSync(unregSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(unregSkillDir, "SKILL.md"),
        "# Unregistered Skill\nThis skill exists but is not in skill-rules",
        "utf8",
      );

      const result = runValidate();
      expect(
        result.stdout.includes("unregistered") ||
          result.stdout.includes("unregistered-skill"),
      ).toBe(true);
    });

    it("should report valid skills count", () => {
      // create a properly configured skill
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  valid-skill:
    type: domain
    enforcement: suggest
    priority: medium
    description: "A properly configured skill"
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      // create matching SKILL.md
      const skillDir = path.join(skillsDir, "valid-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        "# Valid Skill\nProperly configured skill",
        "utf8",
      );

      const result = runValidate();
      // exitCode is the only load-bearing signal here: `includes("valid")` matches the
      // skill's own name, and runValidate hardcodes stderr to "" on success
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("1 valid skill(s)");
    });
  });

  describe("Auto-fix functionality", () => {
    it("treats a missing settings block as valid (settings are optional)", () => {
      // NOTE: this replaces a test named "should fix missing settings with --fix flag".
      // There is no settings auto-fix in the codebase; that test asserted
      // `content.includes("settings") || exitCode === 0` and passed purely on the second
      // disjunct, which was 0 only because --fix silently did nothing.
      fs.mkdirSync(path.join(skillsDir, "test-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "test-skill", "SKILL.md"),
        "---\nname: test-skill\ndescription: test\n---\n# test\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  test-skill:
    type: domain
    enforcement: suggest
    priority: medium
    description: "no settings block present"
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate();

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("error(s)");
    });

    it("removes the orphaned entry with --fix --yes, and the file proves it", () => {
      // Previously asserted `!content.includes(...) || stdout.includes("orphan")`, which
      // passed on the word "orphan" appearing in the ERROR listing while the repair path
      // never executed. --yes makes the repair reachable non-interactively.
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  orphaned-skill:
    type: domain
    enforcement: suggest
    priority: high
    description: "no SKILL.md on disk"
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate("--fix --yes");

      const after = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );
      expect(after).not.toContain("orphaned-skill"); // the observable
      expect(result.stdout).toContain("Removed: orphaned-skill");
      expect(result.exitCode).toBe(0);
    });

    it("adds the unregistered skill with --fix --yes, and the file proves it", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills: {}
`,
        "utf8",
      );
      fs.mkdirSync(path.join(skillsDir, "new-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "new-skill", "SKILL.md"),
        "---\nname: new-skill\ndescription: test\n---\n# test\n",
        "utf8",
      );

      const result = runValidate("--fix --yes");

      const after = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );
      expect(after).toContain("new-skill");
      expect(result.stdout).toContain("Added: new-skill");
    });

    it("does not delete a malformed rule the user was told to fix by hand", () => {
      // the crash guard used to mutate the same config object that --fix serializes, so
      // `bare-skill` silently vanished while the output said to edit it manually
      fs.mkdirSync(path.join(skillsDir, "kept-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "kept-skill", "SKILL.md"),
        "---\nname: kept-skill\ndescription: test\n---\n# test\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  kept-skill:
    type: domain
    enforcement: suggest
    priority: high
    description: "fine"
    promptTriggers:
      keywords: [test]
  bare-skill:
`,
        "utf8",
      );

      // an UNREGISTERED skill forces auto-fix to actually serialize the config —
      // without a write, the assertion below would pass on a file nobody touched
      fs.mkdirSync(path.join(skillsDir, "extra-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "extra-skill", "SKILL.md"),
        "---\nname: extra-skill\ndescription: test\n---\n# test\n",
        "utf8",
      );

      const result = runValidate("--fix --yes");

      const after = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );
      expect(result.stdout).toContain("Added: extra-skill"); // proves a write happened
      expect(after).toContain("bare-skill"); // survives — it is the user's data
      expect(result.exitCode).not.toBe(0);
    });

    it("should still exit non-zero when --fix cannot repair the errors", () => {
      // --fix repairs orphaned/unregistered entries and missing settings, but not schema
      // errors inside a rule. Exiting 0 there would let a CI job pass with a config whose
      // skills can never fire.
      fs.mkdirSync(path.join(skillsDir, "unfixable-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "unfixable-skill", "SKILL.md"),
        "---\nname: unfixable-skill\ndescription: test\n---\n# test\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  unfixable-skill:
    priority: high
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate("--fix --yes");

      expect(result.stdout).not.toContain("interactive terminal"); // repair path ran
      expect(result.stdout).toContain("remain after auto-fix");
      expect(result.exitCode).not.toBe(0);
    });

    it("refuses to auto-fix when stdin is not a TTY, and fails the run", () => {
      // `prompts` gates every repair behind an interactive confirm; on a closed stdin it
      // aborts and terminates the process from inside the prompt, so nothing is repaired
      // and no later code runs. Previously that combination exited 0 — an open CI gate.
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
skills:
  ghost-skill:
    priority: high
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate("--fix");

      expect(result.stdout).toContain("requires an interactive terminal");
      expect(result.exitCode).not.toBe(0);
      // the observable that matters: the file was NOT modified
      const after = fs.readFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        "utf8",
      );
      expect(after).toContain("ghost-skill");
    });

    it("reports a null rule entry instead of crashing", () => {
      // `my-skill:` with no body parses to null; property access used to throw
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  empty-rule:
`,
        "utf8",
      );

      const result = runValidate();

      expect(result.stdout).toContain("Rule is empty");
      expect(result.stdout).not.toContain("TypeError");
      expect(result.exitCode).not.toBe(0);
    });

    it("repairs a config with an absent skills block instead of crashing", () => {
      // `skills` absent is normalizable — but auto-fix used to assign into `undefined`.
      // Distinct from present-but-malformed, which must be refused.
      fs.mkdirSync(path.join(skillsDir, "new-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "new-skill", "SKILL.md"),
        "---\nname: new-skill\ndescription: test\n---\n# test\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"\n`,
        "utf8",
      );

      const result = runValidate("--fix --yes");

      expect(result.stdout).not.toContain("TypeError");
      expect(result.stdout).not.toContain("Refusing to auto-fix");
      expect(
        fs.readFileSync(path.join(skillsDir, "skill-rules.yaml"), "utf8"),
      ).toContain("new-skill");
      expect(result.exitCode).toBe(0);
    });

    it("refuses to auto-fix a present-but-malformed skills block, preserving it", () => {
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  - name: legacy-one
  - name: legacy-two
`,
        "utf8",
      );

      const result = runValidate("--fix --yes");

      expect(result.stdout).toContain("Refusing to auto-fix");
      expect(
        fs.readFileSync(path.join(skillsDir, "skill-rules.yaml"), "utf8"),
      ).toContain("legacy-one"); // the user's data survives
      expect(result.exitCode).not.toBe(0);
    });

    it("rejects a scalar or array at the top level instead of crashing", () => {
      // yaml.load returns a primitive; the truthiness check passed and assigning
      // `.skills` onto it threw a TypeError
      for (const body of ["true\n", "\"oops\"\n", "- a\n- b\n"]) {
        fs.writeFileSync(path.join(skillsDir, "skill-rules.yaml"), body, "utf8");
        const result = runValidate();
        expect(result.stdout).not.toContain("TypeError");
        expect(result.stdout).toContain("must be a mapping at the top level");
        expect(result.exitCode).not.toBe(0);
      }
    });

    it("accepts a config with no skills block at all", () => {
      // structurally valid YAML; Object.keys(undefined) used to throw
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
settings:
  maxSuggestions: 3
`,
        "utf8",
      );

      const result = runValidate();

      expect(result.stdout).not.toContain("TypeError");
      expect(result.exitCode).toBe(0);
    });

    it("does not flag a rule that has empty keywords but real intentPatterns", () => {
      // `??` short-circuits on false, so the intentPatterns branch was never consulted
      fs.mkdirSync(path.join(skillsDir, "mixed-triggers"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "mixed-triggers", "SKILL.md"),
        "---\nname: mixed-triggers\ndescription: test\n---\n# test\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  mixed-triggers:
    type: domain
    enforcement: suggest
    priority: high
    description: "has intent patterns only"
    promptTriggers:
      keywords: []
      intentPatterns: ["deploy.*staging"]
`,
        "utf8",
      );

      const result = runValidate();

      expect(result.stdout).not.toContain("no triggers defined");
      expect(result.exitCode).toBe(0);
    });

    it("should reject an activationStrategy outside the enum", () => {
      fs.mkdirSync(path.join(skillsDir, "bad-strategy"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "bad-strategy", "SKILL.md"),
        "---\nname: bad-strategy\ndescription: test\n---\n# test\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(skillsDir, "skill-rules.yaml"),
        `version: "1.0"
skills:
  bad-strategy:
    type: workflow
    enforcement: suggest
    priority: high
    description: "test"
    activationStrategy: imperative
    promptTriggers:
      keywords: [test]
`,
        "utf8",
      );

      const result = runValidate();

      expect(result.stdout).toContain("Invalid activationStrategy: imperative");
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle missing skill-rules file", () => {
      // no skill-rules file in skillsDir
      const result = runValidate();
      expect(
        result.exitCode !== 0 ||
          result.stderr.includes("not found") ||
          result.stdout.includes("not found"),
      ).toBe(true);
    });

    it("should handle empty skill-rules file", () => {
      fs.writeFileSync(path.join(skillsDir, "skill-rules.yaml"), "", "utf8");

      const result = runValidate();
      // empty config should be handled gracefully - either error or warning
      // verify specific behavior rather than "something happened"
      const hasError = result.exitCode !== 0;
      const hasWarning = result.stdout.toLowerCase().includes("no skills") ||
                         result.stdout.toLowerCase().includes("empty") ||
                         result.stderr.toLowerCase().includes("invalid");
      expect(hasError || hasWarning).toBe(true);
    });
  });
});

/**
 * `validate` hand-maintains the list of known/required rule fields. Nothing binds those
 * lists to schema/skill-rules.schema.json, so adding a property to the schema would make
 * every valid config emit a spurious "Unknown field" warning. Bind them here.
 */
describe("validate stays in sync with the JSON schema", () => {
  const schemaPath = path.join(__dirname, "../../schema/skill-rules.schema.json");

  function skillRuleSchema(): {
    properties: Record<string, unknown>;
    required: string[];
  } {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as unknown;
    let found: { properties: Record<string, unknown>; required: string[] } | null = null;
    const walk = (node: unknown): void => {
      if (found || !node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      const props = obj.properties as Record<string, unknown> | undefined;
      if (props && "enforcement" in props && "priority" in props) {
        found = {
          properties: props,
          required: (obj.required as string[] | undefined) ?? [],
        };
        return;
      }
      Object.values(obj).forEach(walk);
    };
    walk(schema);
    if (!found) throw new Error("SkillRule definition not found in schema");
    return found;
  }

  it("accepts a rule using every property the schema allows", () => {
    const tmp = fs.mkdtempSync("/tmp/schema-sync-");
    const skills = path.join(tmp, ".claude", "skills");
    fs.mkdirSync(path.join(skills, "everything"), { recursive: true });
    fs.writeFileSync(
      path.join(skills, "everything", "SKILL.md"),
      "---\nname: everything\ndescription: test\n---\n# test\n",
      "utf8",
    );

    const { properties, required } = skillRuleSchema();

    // bind the schema's required list to validate.ts's hand-rolled requiredFields
    expect([...required].sort()).toEqual(
      ["description", "enforcement", "priority", "type"].sort(),
    );
    const rule: Record<string, unknown> = {
      type: "domain",
      enforcement: "suggest",
      priority: "high",
      description: "uses every schema property",
      activationStrategy: "suggestive",
      cooldownMinutes: 5,
      promptTriggers: { keywords: ["x"] },
      fileTriggers: { pathPatterns: ["**/*.ts"] },
      preToolTriggers: { toolName: "Bash" },
      shadowTriggers: { keywords: ["y"] },
      stopTriggers: { keywords: ["z"] },
      promptHook: { type: "prompt", prompt: "q" },
      validationRules: [],
    };

    // if the schema gains a property this fixture does not cover, this fails loudly
    // rather than silently drifting from validate.ts's knownKeys list
    expect(Object.keys(rule).sort()).toEqual(Object.keys(properties).sort());

    fs.writeFileSync(
      path.join(skills, "skill-rules.yaml"),
      yaml.dump({ version: "1.0", skills: { everything: rule } }),
      "utf8",
    );

    const result = execSync(`node "${COMPILED_CLI_PATH}" validate --verbose`, {
      cwd: tmp,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    expect(result).not.toContain("Unknown field");
    expect(result).not.toContain("Missing required field");
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
