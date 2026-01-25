import { describe, expect, it } from "vitest";

import type { SmartTriggers } from "../src/parsers/frontmatter-parser.js";

import {
  inferSkillName,
  parseFrontmatter,
  smartTriggersToSkillRule,
} from "../src/parsers/frontmatter-parser.js";

describe("parseFrontmatter", () => {
  it("should parse standard skill frontmatter", () => {
    const content = `---
name: my-skill
description: A test skill
disable-model-invocation: true
---

# My Skill

This is the skill content.
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.success).toBe(true);
    expect(result.frontmatter?.standard.name).toBe("my-skill");
    expect(result.frontmatter?.standard.description).toBe("A test skill");
    expect(result.frontmatter?.standard["disable-model-invocation"]).toBe(true);
    expect(result.content).toBe("# My Skill\n\nThis is the skill content.");
  });

  it("should parse x-smart-triggers frontmatter", () => {
    const content = `---
name: terraform-apply
description: Applies Terraform execution plan

x-smart-triggers:
  activationStrategy: guaranteed
  promptTriggers:
    keywords:
      - terraform
      - apply
    intentPatterns:
      - "(apply|deploy).*terraform"
  fileTriggers:
    pathPatterns:
      - "*.tfplan"
      - "*.tf"
  cooldownMinutes: 30
---

# Terraform Apply Skill
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.success).toBe(true);
    expect(result.frontmatter?.smartTriggers).toBeDefined();
    expect(result.frontmatter?.smartTriggers?.activationStrategy).toBe(
      "guaranteed",
    );
    expect(result.frontmatter?.smartTriggers?.promptTriggers?.keywords).toEqual(
      ["terraform", "apply"],
    );
    expect(
      result.frontmatter?.smartTriggers?.promptTriggers?.intentPatterns,
    ).toEqual(["(apply|deploy).*terraform"]);
    expect(
      result.frontmatter?.smartTriggers?.fileTriggers?.pathPatterns,
    ).toEqual(["*.tfplan", "*.tf"]);
    expect(result.frontmatter?.smartTriggers?.cooldownMinutes).toBe(30);
  });

  it("should handle files without frontmatter", () => {
    const content = "# Just Content\n\nNo frontmatter here.";

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.success).toBe(true);
    expect(result.frontmatter?.standard).toEqual({});
    expect(result.frontmatter?.smartTriggers).toBeUndefined();
    expect(result.content).toBe("# Just Content\n\nNo frontmatter here.");
  });

  it("should handle invalid YAML gracefully", () => {
    const content = `---
name: [invalid yaml
---

Content
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.success).toBe(false);
    expect(result.error).toContain("YAML parse error");
  });

  it("should validate activation strategy values", () => {
    const validContent = `---
x-smart-triggers:
  activationStrategy: guaranteed
---
`;
    const invalidContent = `---
x-smart-triggers:
  activationStrategy: invalid_strategy
---
`;

    const validResult = parseFrontmatter(validContent, "/path/to/SKILL.md");
    const invalidResult = parseFrontmatter(invalidContent, "/path/to/SKILL.md");

    expect(validResult.frontmatter?.smartTriggers?.activationStrategy).toBe(
      "guaranteed",
    );
    expect(
      invalidResult.frontmatter?.smartTriggers?.activationStrategy,
    ).toBeUndefined();
  });

  it("should parse preToolTriggers", () => {
    const content = `---
x-smart-triggers:
  preToolTriggers:
    toolName: Bash
    inputPatterns:
      - "rm -rf"
      - "sudo"
---
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.frontmatter?.smartTriggers?.preToolTriggers).toEqual({
      toolName: "Bash",
      inputPatterns: ["rm -rf", "sudo"],
    });
  });

  it("should parse stopTriggers", () => {
    const content = `---
x-smart-triggers:
  stopTriggers:
    keywords:
      - done
      - complete
    promptEvaluation: "check if tests pass"
---
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.frontmatter?.smartTriggers?.stopTriggers).toEqual({
      keywords: ["done", "complete"],
      promptEvaluation: "check if tests pass",
    });
  });

  it("should parse shadowTriggers", () => {
    const content = `---
x-smart-triggers:
  shadowTriggers:
    keywords:
      - review
      - pr
    intentPatterns:
      - "create.*pull request"
---
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.frontmatter?.smartTriggers?.shadowTriggers).toEqual({
      keywords: ["review", "pr"],
      intentPatterns: ["create.*pull request"],
    });
  });

  it("should parse promptHook", () => {
    const content = `---
x-smart-triggers:
  activationStrategy: prompt_enhanced
  promptHook: ".claude/hooks/auth-decision.md"
---
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.frontmatter?.smartTriggers?.promptHook).toBe(
      ".claude/hooks/auth-decision.md",
    );
  });

  it("should parse hooks array in standard frontmatter", () => {
    const content = `---
name: my-skill
hooks:
  - type: script
    when: PreToolUse
    run: ".claude/hooks/pre-check.sh"
  - type: prompt
    when: Stop
    prompt: "Verify the task is complete"
---
`;

    const result = parseFrontmatter(content, "/path/to/SKILL.md");

    expect(result.frontmatter?.standard.hooks).toHaveLength(2);
    expect(result.frontmatter?.standard.hooks?.[0]).toEqual({
      type: "script",
      when: "PreToolUse",
      run: ".claude/hooks/pre-check.sh",
    });
    expect(result.frontmatter?.standard.hooks?.[1]).toEqual({
      type: "prompt",
      when: "Stop",
      prompt: "Verify the task is complete",
    });
  });
});

describe("smartTriggersToSkillRule", () => {
  it("should convert triggers to skill rule format", () => {
    const triggers: SmartTriggers = {
      activationStrategy: "guaranteed",
      promptTriggers: {
        keywords: ["terraform"],
        intentPatterns: ["apply.*terraform"],
      },
      fileTriggers: {
        pathPatterns: ["*.tf"],
      },
      cooldownMinutes: 30,
    };

    const rule = smartTriggersToSkillRule(triggers, "Test description");

    expect(rule.description).toBe("Test description");
    expect(rule.activationStrategy).toBe("guaranteed");
    expect(rule.promptTriggers?.keywords).toEqual(["terraform"]);
    expect(rule.fileTriggers?.pathPatterns).toEqual(["*.tf"]);
    expect(rule.cooldownMinutes).toBe(30);
  });

  it("should only include defined fields", () => {
    const triggers: SmartTriggers = {
      activationStrategy: "suggestive",
    };

    const rule = smartTriggersToSkillRule(triggers, "Minimal");

    expect(rule.description).toBe("Minimal");
    expect(rule.activationStrategy).toBe("suggestive");
    expect(rule.promptTriggers).toBeUndefined();
    expect(rule.fileTriggers).toBeUndefined();
  });
});

describe("inferSkillName", () => {
  it("should extract skill name from standard path", () => {
    expect(inferSkillName(".claude/commands/my-skill/SKILL.md")).toBe(
      "my-skill",
    );
    expect(
      inferSkillName("/home/user/.claude/commands/terraform/SKILL.md"),
    ).toBe("terraform");
  });

  it("should handle paths with different cases", () => {
    expect(inferSkillName(".claude/commands/My-Skill/skill.md")).toBe(
      "My-Skill",
    );
  });

  it("should fallback to filename without extension", () => {
    expect(inferSkillName("some/path/custom-skill.md")).toBe("custom-skill");
  });
});
