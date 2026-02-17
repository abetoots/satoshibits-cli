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
      concerns: { matched: ["idempotency-boundaries"], skipped: ["resilience-triad"] },
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
      concerns: { matched: ["c1"], skipped: [] },
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
      concerns: { matched: ["c1"], skipped: [] },
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
      concerns: { matched: ["c1"], skipped: [] },
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
      concerns: { matched: [], skipped: [] },
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
});
