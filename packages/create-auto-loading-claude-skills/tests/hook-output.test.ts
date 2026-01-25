import { describe, expect, it } from "vitest";

import type {
  GuaranteedSkillInfo,
  SkillContextInfo,
} from "@satoshibits/claude-skill-runtime";

import {
  buildBlockOutput,
  buildPreToolUseAllowOutput,
  buildPreToolUseAskOutput,
  buildPreToolUseDenyOutput,
  buildUserPromptSubmitOutput,
  formatSkillContextAsString,
} from "@satoshibits/claude-skill-runtime";

// type for parsed hook output JSON (mirrors the output structure)
interface ParsedHookOutput {
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
  };
  decision?: string;
  updatedInput?: string;
}

describe("hook-output builders (CORRECTED per HOOKS_REFERENCE_CLAUDE.md)", () => {
  describe("formatSkillContextAsString", () => {
    it("should format guaranteed skills as string", () => {
      const skills: GuaranteedSkillInfo[] = [
        {
          name: "terraform-apply",
          description: "Applies Terraform execution plan",
          content: "# Terraform Apply\n\nThis skill...",
          usage: "/terraform-apply",
        },
      ];

      const context: SkillContextInfo = {
        activated_by_reliability_engine: true,
        guaranteed_skills: skills,
      };

      const result = formatSkillContextAsString(context);

      expect(result).toContain("SKILL RELIABILITY ENGINE");
      expect(result).toContain("Guaranteed Skills");
      expect(result).toContain("/terraform-apply");
      expect(result).toContain("# Terraform Apply");
    });

    it("should format suggested skills as string", () => {
      const context: SkillContextInfo = {
        activated_by_reliability_engine: true,
        suggested_skills: [
          {
            name: "api-docs",
            description: "Generate API docs",
            reason: "Matched trigger",
          },
        ],
      };

      const result = formatSkillContextAsString(context);

      expect(result).toContain("Suggested Skills");
      expect(result).toContain("/api-docs");
    });

    it("should format shadow suggestions as string", () => {
      const context: SkillContextInfo = {
        activated_by_reliability_engine: true,
        shadow_suggestions: [
          {
            name: "review",
            description: "Code review",
            reason: "Related context",
          },
        ],
      };

      const result = formatSkillContextAsString(context);

      expect(result).toContain("Related Skills");
      expect(result).toContain("/review");
    });
  });

  describe("buildUserPromptSubmitOutput", () => {
    it("should return empty object when no context", () => {
      const output = buildUserPromptSubmitOutput(null);

      expect(output).toEqual({});
    });

    it("should build output with hookSpecificOutput containing string additionalContext", () => {
      const skills: GuaranteedSkillInfo[] = [
        {
          name: "test-skill",
          description: "A test skill",
          content: "# Test\n\nContent",
        },
      ];

      const context: SkillContextInfo = {
        activated_by_reliability_engine: true,
        guaranteed_skills: skills,
      };

      const output = buildUserPromptSubmitOutput(context);

      // verify CORRECTED structure
      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput?.hookEventName).toBe("UserPromptSubmit");
      expect(typeof output.hookSpecificOutput?.additionalContext).toBe(
        "string",
      );
      expect(output.hookSpecificOutput?.additionalContext).toContain(
        "test-skill",
      );

      // verify NO deprecated fields
      expect(output).not.toHaveProperty("decision");
      expect(output).not.toHaveProperty("updatedInput");
      expect(output).not.toHaveProperty("additionalContext"); // should be under hookSpecificOutput
    });
  });

  describe("buildBlockOutput", () => {
    it('should build blocking output with decision: "block"', () => {
      const output = buildBlockOutput("Must run terraform plan first");

      expect(output.decision).toBe("block");
      expect(output.reason).toBe("Must run terraform plan first");
      expect(output.hookSpecificOutput).toBeUndefined();
    });
  });

  describe("buildPreToolUseDenyOutput", () => {
    it('should build deny output with permissionDecision: "deny"', () => {
      const output = buildPreToolUseDenyOutput(
        "Guardrail triggered",
        "Context info",
      );

      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
      expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
      expect(output.hookSpecificOutput?.permissionDecisionReason).toBe(
        "Guardrail triggered",
      );
      expect(output.hookSpecificOutput?.additionalContext).toBe("Context info");

      // verify NO deprecated fields
      expect(output).not.toHaveProperty("decision");
    });
  });

  describe("buildPreToolUseAllowOutput", () => {
    it("should return empty object when no additionalContext", () => {
      const output = buildPreToolUseAllowOutput();

      expect(output).toEqual({});
    });

    it("should build allow output with additionalContext", () => {
      const output = buildPreToolUseAllowOutput(
        "Warning: proceed with caution",
      );

      expect(output.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
      expect(output.hookSpecificOutput?.permissionDecision).toBe("allow");
      expect(output.hookSpecificOutput?.additionalContext).toBe(
        "Warning: proceed with caution",
      );
    });
  });

  describe("buildPreToolUseAskOutput", () => {
    it('should build ask output with permissionDecision: "ask"', () => {
      const output = buildPreToolUseAskOutput("Please confirm this action");

      expect(output.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
      expect(output.hookSpecificOutput?.permissionDecision).toBe("ask");
      expect(output.hookSpecificOutput?.permissionDecisionReason).toBe(
        "Please confirm this action",
      );
    });
  });
});

describe("output JSON structure matches official schema", () => {
  it("should produce valid JSON for UserPromptSubmit (CORRECTED schema)", () => {
    const context: SkillContextInfo = {
      activated_by_reliability_engine: true,
      guaranteed_skills: [
        {
          name: "test-skill",
          description: "A test skill",
          content: "# Test\n\nContent",
        },
      ],
    };

    const output = buildUserPromptSubmitOutput(context);
    const json = JSON.stringify(output);
    const parsed = JSON.parse(json) as ParsedHookOutput;

    // verify CORRECTED structure per HOOKS_REFERENCE_CLAUDE.md
    expect(parsed).toHaveProperty("hookSpecificOutput");
    expect(parsed.hookSpecificOutput).toHaveProperty(
      "hookEventName",
      "UserPromptSubmit",
    );
    expect(parsed.hookSpecificOutput).toHaveProperty("additionalContext");
    expect(typeof parsed.hookSpecificOutput!.additionalContext).toBe("string");

    // verify NO deprecated top-level fields
    expect(parsed).not.toHaveProperty("decision");
    expect(parsed).not.toHaveProperty("updatedInput");
  });

  it("should produce valid JSON for PreToolUse deny (CORRECTED schema)", () => {
    const output = buildPreToolUseDenyOutput("Blocked by guardrail");
    const json = JSON.stringify(output);
    const parsed = JSON.parse(json) as ParsedHookOutput;

    // verify CORRECTED structure per HOOKS_REFERENCE_CLAUDE.md
    expect(parsed).toHaveProperty("hookSpecificOutput");
    expect(parsed.hookSpecificOutput).toHaveProperty(
      "hookEventName",
      "PreToolUse",
    );
    expect(parsed.hookSpecificOutput).toHaveProperty(
      "permissionDecision",
      "deny",
    );
    expect(parsed.hookSpecificOutput).toHaveProperty(
      "permissionDecisionReason",
    );

    // verify NO deprecated fields
    expect(parsed).not.toHaveProperty("decision");
  });

  it("should handle special characters in content", () => {
    const context: SkillContextInfo = {
      activated_by_reliability_engine: true,
      guaranteed_skills: [
        {
          name: "special-chars",
          description: 'Has "quotes" and \\backslashes\\',
          content: "Content with `code` and\nnewlines\n```json\n{}\n```",
        },
      ],
    };

    const output = buildUserPromptSubmitOutput(context);
    const json = JSON.stringify(output);

    // should not throw
    const parsed = JSON.parse(json) as ParsedHookOutput;
    expect(parsed.hookSpecificOutput!.additionalContext).toContain("```json");
  });
});
