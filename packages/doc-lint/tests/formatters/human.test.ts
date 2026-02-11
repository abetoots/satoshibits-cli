import { describe, it, expect } from "vitest";

import { formatAssembleHuman, formatLintHuman } from "../../src/formatters/human.js";

import type { AssembleResult, LintResult } from "../../src/types/index.js";

describe("human formatter", () => {
  it("formats assemble result for humans", async () => {
    const result: AssembleResult = {
      version: "1.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test Project",
      signals: ["payments", "webhooks"],
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
      signals: ["payments"],
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

  it("shows PASS for results with no errors", async () => {
    const result: LintResult = {
      version: "1.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: [],
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
