import { describe, it, expect } from "vitest";

import { applyToleranceFilter, applyExclusionFilter, buildCoverageInfo, filterExcludedConcernPrompts } from "../../src/core/evaluator.js";

import type { Finding, Severity, Confidence, AssembledPrompt, ToleranceConfig, ExclusionEntry, LoadedConcern, ConcernSchema, InteractionSchema } from "../../src/types/index.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-1",
    concernId: "test-concern",
    relatedItem: "TestComponent",
    severity: "error" as Severity,
    confidence: "high" as Confidence,
    description: "Test finding",
    sourceSearched: "ADD Section 1",
    failureConditionTriggered: "test condition",
    risk: "test risk",
    recommendation: "test recommendation",
    requiresHumanReview: false,
    ...overrides,
  };
}

describe("tolerance pipeline", () => {
  describe("applyToleranceFilter", () => {
    const findings: Finding[] = [
      makeFinding({ id: "e1", severity: "error" }),
      makeFinding({ id: "w1", severity: "warn" }),
      makeFinding({ id: "w2", severity: "warn" }),
      makeFinding({ id: "n1", severity: "note" }),
    ];

    it("threshold='error' keeps only errors", () => {
      const tolerance: ToleranceConfig = { severity_threshold: "error" };
      const filtered = applyToleranceFilter(findings, tolerance);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe("e1");
    });

    it("threshold='warn' keeps errors and warnings", () => {
      const tolerance: ToleranceConfig = { severity_threshold: "warn" };
      const filtered = applyToleranceFilter(findings, tolerance);
      expect(filtered).toHaveLength(3);
      expect(filtered.map((f) => f.severity)).toEqual(["error", "warn", "warn"]);
    });

    it("threshold='note' keeps everything", () => {
      const tolerance: ToleranceConfig = { severity_threshold: "note" };
      const filtered = applyToleranceFilter(findings, tolerance);
      expect(filtered).toHaveLength(4);
    });

    it("no threshold keeps everything", () => {
      const tolerance: ToleranceConfig = {};
      const filtered = applyToleranceFilter(findings, tolerance);
      expect(filtered).toHaveLength(4);
    });

    it("undefined tolerance keeps everything", () => {
      const filtered = applyToleranceFilter(findings, undefined);
      expect(filtered).toHaveLength(4);
    });
  });
});

describe("exclusion pipeline", () => {
  describe("applyExclusionFilter", () => {
    const findings: Finding[] = [
      makeFinding({ id: "f1", relatedItem: "legacy-auth-module" }),
      makeFinding({ id: "f2", relatedItem: "PaymentService" }),
      makeFinding({ id: "f3", relatedItem: "legacy-auth-module.login" }),
      makeFinding({ id: "f4", relatedItem: "OrderService" }),
    ];

    const exclusions: ExclusionEntry[] = [
      { component: "legacy-auth-module", reason: "Deprecated" },
    ];

    it("filters findings matching excluded component", () => {
      const result = applyExclusionFilter(findings, exclusions);
      expect(result.kept).toHaveLength(2);
      expect(result.kept.map((f) => f.id)).toEqual(["f2", "f4"]);
    });

    it("tracks excluded finding IDs", () => {
      const result = applyExclusionFilter(findings, exclusions);
      expect(result.excluded).toHaveLength(2);
      expect(result.excluded.map((f) => f.id)).toEqual(["f1", "f3"]);
    });

    it("non-matching findings are unaffected", () => {
      const result = applyExclusionFilter(findings, exclusions);
      expect(result.kept.find((f) => f.id === "f2")).toBeDefined();
      expect(result.kept.find((f) => f.id === "f4")).toBeDefined();
    });

    it("empty exclusions has no effect", () => {
      const result = applyExclusionFilter(findings, []);
      expect(result.kept).toHaveLength(4);
      expect(result.excluded).toHaveLength(0);
    });

    it("undefined exclusions has no effect", () => {
      const result = applyExclusionFilter(findings, undefined);
      expect(result.kept).toHaveLength(4);
      expect(result.excluded).toHaveLength(0);
    });
  });
});

describe("concern-level exclusion filtering", () => {
  function makePrompt(overrides: Partial<AssembledPrompt> = {}): AssembledPrompt {
    return {
      concernId: "test-concern",
      concernVersion: "1.0",
      concernName: "Test Concern",
      type: "concern",
      system: "system prompt",
      user: "user prompt",
      responseSchema: {},
      metadata: { documentsIncluded: ["brd"], templateVersion: "1.0" },
      ...overrides,
    };
  }

  describe("filterExcludedConcernPrompts", () => {
    const prompts: AssembledPrompt[] = [
      makePrompt({ concernId: "threat-model-coverage", concernName: "Threat Model Coverage" }),
      makePrompt({ concernId: "auth-boundary-consistency", concernName: "Auth Boundary" }),
      makePrompt({ concernId: "idempotency-boundaries", concernName: "Idempotency" }),
      makePrompt({ concernId: "contradiction-scanner", concernName: "Contradictions", type: "contradiction" }),
    ];

    it("skips prompts whose concernId matches an exclusion", () => {
      const exclusions: ExclusionEntry[] = [
        { concernId: "threat-model-coverage", reason: "Not applicable" },
      ];
      const result = filterExcludedConcernPrompts(prompts, exclusions);
      expect(result.kept.map((p) => p.concernId)).toEqual([
        "auth-boundary-consistency",
        "idempotency-boundaries",
        "contradiction-scanner",
      ]);
      expect(result.excludedConcernIds).toEqual(["threat-model-coverage"]);
    });

    it("skips multiple concern IDs", () => {
      const exclusions: ExclusionEntry[] = [
        { concernId: "threat-model-coverage", reason: "Not applicable" },
        { concernId: "idempotency-boundaries", reason: "Stateless service" },
      ];
      const result = filterExcludedConcernPrompts(prompts, exclusions);
      expect(result.kept.map((p) => p.concernId)).toEqual([
        "auth-boundary-consistency",
        "contradiction-scanner",
      ]);
      expect(result.excludedConcernIds).toEqual(["threat-model-coverage", "idempotency-boundaries"]);
    });

    it("does not filter prompts when exclusions only have component (no concernId)", () => {
      const exclusions: ExclusionEntry[] = [
        { component: "legacy-auth-module", reason: "Deprecated" },
      ];
      const result = filterExcludedConcernPrompts(prompts, exclusions);
      expect(result.kept).toHaveLength(4);
      expect(result.excludedConcernIds).toEqual([]);
    });

    it("returns all prompts when exclusions is undefined", () => {
      const result = filterExcludedConcernPrompts(prompts, undefined);
      expect(result.kept).toHaveLength(4);
      expect(result.excludedConcernIds).toEqual([]);
    });

    it("never filters contradiction prompts even if their concernId matches", () => {
      const exclusions: ExclusionEntry[] = [
        { concernId: "contradiction-scanner", reason: "Test" },
      ];
      const result = filterExcludedConcernPrompts(prompts, exclusions);
      // contradiction prompt is kept despite matching concernId
      expect(result.kept.find((p) => p.type === "contradiction")).toBeDefined();
      expect(result.excludedConcernIds).toEqual([]);
    });
  });
});

describe("tier filtering", () => {
  // Replicates the tier filter logic from assemble() for unit testing
  function applyTierFilter(
    matched: LoadedConcern[],
    skipped: LoadedConcern[],
    tierFilter: number | "all" | undefined,
  ): { matched: LoadedConcern[]; skipped: LoadedConcern[] } {
    if (tierFilter === undefined || tierFilter === "all") {
      return { matched, skipped };
    }
    const maxTier = tierFilter;
    const tierSkipped = matched.filter(
      (c) => c.tier == null || c.tier > maxTier,
    );
    const tierMatched = matched.filter(
      (c) => c.tier != null && c.tier <= maxTier,
    );
    return { matched: tierMatched, skipped: [...skipped, ...tierSkipped] };
  }

  function makeTieredConcern(id: string, tier?: number): LoadedConcern {
    return {
      schema: {} as ConcernSchema,
      filePath: `/fake/${id}.yaml`,
      id,
      version: "1.0",
      name: id,
      type: "concern",
      category: "core",
      severity: "error",
      triggerSignals: ["payments"],
      tier,
    };
  }

  function makeTieredInteraction(id: string): LoadedConcern {
    return {
      schema: {} as InteractionSchema,
      filePath: `/fake/${id}.yaml`,
      id,
      version: "1.0",
      name: id,
      type: "interaction",
      category: "interactions",
      severity: "warn",
      triggerSignals: ["payments", "webhooks"],
    };
  }

  const concerns = [
    makeTieredConcern("feasibility-check", 1),
    makeTieredConcern("idempotency-boundaries", 2),
    makeTieredConcern("horizontal-traceability", 3),
    makeTieredInteraction("cache-ix"),
  ];

  it("--tier 1 keeps only tier 1 concerns", () => {
    const result = applyTierFilter(concerns, [], 1);
    expect(result.matched.map((c) => c.id)).toEqual(["feasibility-check"]);
    expect(result.skipped).toHaveLength(3);
  });

  it("--tier 2 keeps tier 1 + 2 (cumulative)", () => {
    const result = applyTierFilter(concerns, [], 2);
    expect(result.matched.map((c) => c.id)).toEqual([
      "feasibility-check",
      "idempotency-boundaries",
    ]);
    expect(result.skipped).toHaveLength(2);
  });

  it("--tier 3 keeps tier 1 + 2 + 3, excludes interactions", () => {
    const result = applyTierFilter(concerns, [], 3);
    expect(result.matched.map((c) => c.id)).toEqual([
      "feasibility-check",
      "idempotency-boundaries",
      "horizontal-traceability",
    ]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.id).toBe("cache-ix");
  });

  it("--tier all keeps everything including interactions", () => {
    const result = applyTierFilter(concerns, [], "all");
    expect(result.matched).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);
  });

  it("untiered concerns are excluded from numeric tiers", () => {
    const withUntiered = [
      ...concerns,
      makeTieredConcern("untiered-concern"),
    ];
    const result = applyTierFilter(withUntiered, [], 2);
    expect(result.matched.map((c) => c.id)).toEqual([
      "feasibility-check",
      "idempotency-boundaries",
    ]);
    expect(result.skipped.map((c) => c.id)).toContain("untiered-concern");
  });

  it("untiered concerns are included with --tier all", () => {
    const withUntiered = [
      ...concerns,
      makeTieredConcern("untiered-concern"),
    ];
    const result = applyTierFilter(withUntiered, [], "all");
    expect(result.matched).toHaveLength(5);
  });

  it("preserves existing skipped concerns", () => {
    const alreadySkipped = [makeTieredConcern("already-skipped", 2)];
    const result = applyTierFilter(concerns, alreadySkipped, 1);
    expect(result.skipped).toHaveLength(4); // 3 tier-filtered + 1 already skipped
    expect(result.skipped.map((c) => c.id)).toContain("already-skipped");
  });
});

describe("coverage tracking", () => {
  describe("buildCoverageInfo", () => {
    it("tracks evaluated, skipped, and excluded concern IDs", () => {
      const coverage = buildCoverageInfo({
        matched: ["c1", "c2", "c3"],
        skipped: ["c4", "c5"],
        excludedConcernIds: ["c3"],
        documentsLoaded: ["brd", "frd", "add"],
        documentsMissing: ["api_spec"],
      });

      expect(coverage.concernsEvaluated).toEqual(["c1", "c2"]);
      expect(coverage.concernsSkipped).toEqual(["c4", "c5"]);
      expect(coverage.concernsExcluded).toEqual(["c3"]);
      expect(coverage.documentsLoaded).toEqual(["brd", "frd", "add"]);
      expect(coverage.documentsMissing).toEqual(["api_spec"]);
    });

    it("handles no exclusions", () => {
      const coverage = buildCoverageInfo({
        matched: ["c1"],
        skipped: ["c2"],
        excludedConcernIds: [],
        documentsLoaded: ["brd"],
        documentsMissing: [],
      });

      expect(coverage.concernsEvaluated).toEqual(["c1"]);
      expect(coverage.concernsExcluded).toEqual([]);
    });
  });
});
