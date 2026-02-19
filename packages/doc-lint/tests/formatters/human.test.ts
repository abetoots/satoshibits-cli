import { describe, it, expect } from "vitest";

import { formatAssembleHuman, formatLintHuman } from "../../src/formatters/human.js";

import type { AssembleResult, LintResult, SignalAnalysis } from "../../src/types/index.js";

function makeSignals(effective: string[], extra?: Partial<SignalAnalysis>): SignalAnalysis {
  return { declared: effective, detected: [], effective, ...extra };
}

describe("human formatter", () => {
  it("formats assemble result for humans", async () => {
    const result: AssembleResult = {
      version: "1.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test Project",
      signals: makeSignals(["payments", "webhooks"]),
      concerns: {
        matched: ["idempotency-boundaries"],
        skipped: ["resilience-triad"],
        matchedDetails: [{ id: "idempotency-boundaries", tier: 2, type: "concern" as const }],
      },
      prompts: [
        {
          concernId: "idempotency-boundaries",
          concernVersion: "1.0",
          concernName: "Idempotency",
          type: "concern",
          system: "",
          user: "",
          responseSchema: {},
          metadata: { documentsIncluded: [], templateVersion: "1.0" },
        },
      ],
    };

    const output = await formatAssembleHuman(result);
    expect(output).toContain("Test Project");
    expect(output).toContain("idempotency-boundaries");
    expect(output).toContain("1");
  });

  it("formats lint result with findings grouped by severity", async () => {
    const result: LintResult = {
      version: "1.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"]),
      concerns: {
        matched: ["c1"],
        skipped: [],
        matchedDetails: [{ id: "c1", tier: 1, type: "concern" as const }],
      },
      findings: [
        {
          id: "gap-1",
          concernId: "c1",
          relatedItem: "test",
          severity: "error",
          confidence: "high",
          description: "Missing idempotency docs",
          sourceSearched: "ADD",
          failureConditionTriggered: "test",
          risk: "Duplicate processing",
          recommendation: "Add docs",
          requiresHumanReview: false,
        },
        {
          id: "gap-2",
          concernId: "c1",
          relatedItem: "test2",
          severity: "warn",
          confidence: "medium",
          description: "Incomplete retry docs",
          sourceSearched: "FRD",
          failureConditionTriggered: "test",
          risk: "Unknown retry behavior",
          recommendation: "Document retries",
          requiresHumanReview: false,
        },
      ],
      contradictions: [],
      summary: {
        totalFindings: 2,
        errors: 1,
        warnings: 1,
        notes: 0,
        contradictions: 0,
        humanReviewRequired: 0,
      },
    };

    const output = await formatLintHuman(result);
    expect(output).toContain("ERRORS");
    expect(output).toContain("WARNINGS");
    expect(output).toContain("FAIL");
  });

  it("displays mismatch warnings in assemble output", async () => {
    const result: AssembleResult = {
      version: "2.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments", "webhooks"], {
        detected: ["payments", "rate-limiting"],
        mismatch: {
          undeclared: ["rate-limiting"],
          stale: ["webhooks"],
        },
      }),
      concerns: {
        matched: ["c1"],
        skipped: [],
        matchedDetails: [{ id: "c1", tier: 2, type: "concern" as const }],
      },
      prompts: [],
    };

    const output = await formatAssembleHuman(result);
    expect(output).toContain("Undeclared signals found in docs: rate-limiting");
    expect(output).toContain("Declared signals not found in docs: webhooks");
  });

  it("displays mismatch warnings in lint output", async () => {
    const result: LintResult = {
      version: "2.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"], {
        detected: ["payments", "authentication"],
        mismatch: {
          undeclared: ["authentication"],
          stale: [],
        },
      }),
      concerns: {
        matched: ["c1"],
        skipped: [],
        matchedDetails: [{ id: "c1", tier: 2, type: "concern" as const }],
      },
      findings: [],
      contradictions: [],
      summary: {
        totalFindings: 0,
        errors: 0,
        warnings: 0,
        notes: 0,
        contradictions: 0,
        humanReviewRequired: 0,
      },
    };

    const output = await formatLintHuman(result);
    expect(output).toContain("Undeclared signals found in docs: authentication");
  });

  it("shows PASS for results with no errors", async () => {
    const result: LintResult = {
      version: "1.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals([]),
      concerns: { matched: [], skipped: [], matchedDetails: [] },
      findings: [],
      contradictions: [],
      summary: {
        totalFindings: 0,
        errors: 0,
        warnings: 0,
        notes: 0,
        contradictions: 0,
        humanReviewRequired: 0,
      },
    };

    const output = await formatLintHuman(result);
    expect(output).toContain("PASS");
  });

  it("groups assemble output by tier labels", async () => {
    const result: AssembleResult = {
      version: "2.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"]),
      concerns: {
        matched: ["state-ownership-clarity", "idempotency-boundaries", "horizontal-traceability", "cache-invalidation-ix"],
        skipped: [],
        matchedDetails: [
          { id: "state-ownership-clarity", tier: 1, type: "concern" },
          { id: "idempotency-boundaries", tier: 2, type: "concern" },
          { id: "horizontal-traceability", tier: 3, type: "concern" },
          { id: "cache-invalidation-ix", type: "interaction" },
        ],
      },
      prompts: [],
    };

    const output = await formatAssembleHuman(result);
    expect(output).toContain("Tier 1");
    expect(output).toContain("Foundational Correctness");
    expect(output).toContain("Tier 2");
    expect(output).toContain("Behavioral Integrity");
    expect(output).toContain("Tier 3");
    expect(output).toContain("Structural Coherence");
    expect(output).toContain("Interactions");
    expect(output).toContain("cache-invalidation-ix");
  });

  it("shows tier advisory when tier 1 and tier 3 findings both present", async () => {
    const result: LintResult = {
      version: "2.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"]),
      concerns: {
        matched: ["state-ownership", "traceability"],
        skipped: [],
        matchedDetails: [
          { id: "state-ownership", tier: 1, type: "concern" },
          { id: "traceability", tier: 3, type: "concern" },
        ],
      },
      findings: [
        {
          id: "gap-1",
          concernId: "state-ownership",
          relatedItem: "test",
          severity: "error",
          confidence: "high",
          description: "Missing state ownership",
          sourceSearched: "ADD",
          failureConditionTriggered: "test",
          risk: "Ambiguous ownership",
          recommendation: "Clarify owners",
          requiresHumanReview: false,
        },
        {
          id: "gap-2",
          concernId: "traceability",
          relatedItem: "test2",
          severity: "warn",
          confidence: "medium",
          description: "Incomplete traceability",
          sourceSearched: "FRD",
          failureConditionTriggered: "test",
          risk: "Unknown trace",
          recommendation: "Add trace IDs",
          requiresHumanReview: false,
        },
      ],
      contradictions: [],
      summary: {
        totalFindings: 2,
        errors: 1,
        warnings: 1,
        notes: 0,
        contradictions: 0,
        humanReviewRequired: 0,
      },
    };

    const output = await formatLintHuman(result);
    expect(output).toContain("Tier 1 (foundational) findings may invalidate Tier 3 (structural)");
    expect(output).toContain("Address Tier 1 issues first, then re-run.");
  });

  it("does not show tier advisory when only tier 1 and tier 2 findings present", async () => {
    const result: LintResult = {
      version: "2.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"]),
      concerns: {
        matched: ["state-ownership", "idempotency"],
        skipped: [],
        matchedDetails: [
          { id: "state-ownership", tier: 1, type: "concern" },
          { id: "idempotency", tier: 2, type: "concern" },
        ],
      },
      findings: [
        {
          id: "gap-1",
          concernId: "state-ownership",
          relatedItem: "test",
          severity: "error",
          confidence: "high",
          description: "Missing state ownership",
          sourceSearched: "ADD",
          failureConditionTriggered: "test",
          risk: "Ambiguous ownership",
          recommendation: "Clarify owners",
          requiresHumanReview: false,
        },
        {
          id: "gap-2",
          concernId: "idempotency",
          relatedItem: "test2",
          severity: "warn",
          confidence: "medium",
          description: "Missing idempotency keys",
          sourceSearched: "FRD",
          failureConditionTriggered: "test",
          risk: "Duplicate processing",
          recommendation: "Add idempotency keys",
          requiresHumanReview: false,
        },
      ],
      contradictions: [],
      summary: {
        totalFindings: 2,
        errors: 1,
        warnings: 1,
        notes: 0,
        contradictions: 0,
        humanReviewRequired: 0,
      },
    };

    const output = await formatLintHuman(result);
    expect(output).not.toContain("Tier 1 (foundational) findings may invalidate Tier 3 (structural)");
  });

  it("labels untiered concerns as Untiered, not Interactions", async () => {
    const result: AssembleResult = {
      version: "2.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"]),
      concerns: {
        matched: ["untiered-concern", "some-interaction"],
        skipped: [],
        matchedDetails: [
          { id: "untiered-concern", type: "concern" },
          { id: "some-interaction", type: "interaction" },
        ],
      },
      prompts: [],
    };

    const output = await formatAssembleHuman(result);
    // untiered concern should appear under "Untiered", not "Interactions"
    expect(output).toContain("Untiered");
    expect(output).toContain("untiered-concern");
    expect(output).toContain("Interactions");
    expect(output).toContain("some-interaction");
  });
});
