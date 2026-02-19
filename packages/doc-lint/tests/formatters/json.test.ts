import { describe, it, expect } from "vitest";

import { formatAssembleJson, formatLintJson } from "../../src/formatters/json.js";

import type { AssembleResult, LintResult, SignalAnalysis } from "../../src/types/index.js";

function makeSignals(effective: string[]): SignalAnalysis {
  return { declared: effective, detected: [], effective };
}

describe("json formatter", () => {
  it("formats assemble result as valid JSON", () => {
    const result: AssembleResult = {
      version: "1.0",
      timestamp: "2026-02-10T00:00:00Z",
      project: "Test",
      signals: makeSignals(["payments"]),
      concerns: {
        matched: ["c1"],
        skipped: ["c2"],
        matchedDetails: [{ id: "c1", tier: 2, type: "concern" as const }],
      },
      prompts: [],
    };

    const output = formatAssembleJson(result);
    const parsed = JSON.parse(output) as AssembleResult;
    expect(parsed.project).toBe("Test");
    expect(parsed.concerns.matched).toEqual(["c1"]);
  });

  it("formats lint result as valid JSON", () => {
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

    const output = formatLintJson(result);
    const parsed = JSON.parse(output) as LintResult;
    expect(parsed.summary.totalFindings).toBe(0);
  });
});
