import { describe, it, expect } from "vitest";

import {
  buildPreToolUseAllowOutput,
  buildPreToolUseContextOutput,
  buildPreToolUseDenyOutput,
} from "../hook-output.mjs";

/**
 * Unit-level guards for the PreToolUse permission builders.
 *
 * These are deliberately at the unit level: a security property this important should not
 * depend on spawning a compiled hook binary that a concurrent process could perturb. The
 * core invariant is that a NON-blocking advisory (a `warn` guardrail) must never emit a
 * permission decision — emitting `"allow"` would grant the tool call.
 */
describe("PreToolUse permission builders", () => {
  it("context output adds additionalContext with NO permissionDecision", () => {
    const out = buildPreToolUseContextOutput("some warning");
    expect(out.hookSpecificOutput?.additionalContext).toBe("some warning");
    expect(
      (out.hookSpecificOutput as { permissionDecision?: string } | undefined)
        ?.permissionDecision,
    ).toBeUndefined();
  });

  it("context output is empty (no decision) when there is nothing to say", () => {
    expect(buildPreToolUseContextOutput()).toEqual({});
    expect(buildPreToolUseContextOutput("")).toEqual({});
  });

  it("allow output DOES grant — kept distinct from context output on purpose", () => {
    const out = buildPreToolUseAllowOutput("ctx");
    expect(out.hookSpecificOutput?.permissionDecision).toBe("allow");
  });

  it("deny output blocks with a reason", () => {
    const out = buildPreToolUseDenyOutput("nope");
    expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
  });
});
