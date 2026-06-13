import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { applyToleranceFilter, applyExclusionFilter, applyDriftFilters, buildCoverageInfo, filterExcludedConcernPrompts, lint, assemble } from "../../src/core/evaluator.js";

import type { Finding, Severity, Confidence, AssembledPrompt, ToleranceConfig, ExclusionEntry, DriftFinding, LoadedConcern, ConcernSchema, InteractionSchema } from "../../src/types/index.js";
import type { EvaluationEngine, EvaluationResult } from "../../src/core/engine/types.js";

// stub engine: returns canned content based on prompt type, no network.
// captures prompts so tests can assert real code facts reached the drift prompt.
function makeStubEngine(driftJson: string): EvaluationEngine & { seen: AssembledPrompt[] } {
  const seen: AssembledPrompt[] = [];
  return {
    seen,
    evaluate(prompt: AssembledPrompt): Promise<EvaluationResult> {
      seen.push(prompt);
      if (prompt.type === "drift") {
        return Promise.resolve({ ok: true, content: driftJson });
      }
      // concerns/contradiction: report nothing
      const empty = prompt.type === "contradiction" ? '{"contradictions": []}' : '{"gaps": []}';
      return Promise.resolve({ ok: true, content: empty });
    },
  };
}

function makeDrift(over: Partial<DriftFinding> = {}): DriftFinding {
  return {
    id: "d-1",
    driftType: "value-mismatch",
    docClaim: { text: "3 retries", location: "ADD:4" },
    codeReality: { text: "maxRetries: 5", location: "src/http.ts:12" },
    severity: "error",
    confidence: "high",
    explanation: "mismatch",
    recommendation: "fix docs",
    ...over,
  };
}

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
    cumulative = false,
  ): { matched: LoadedConcern[]; skipped: LoadedConcern[] } {
    if (tierFilter === undefined || tierFilter === "all") {
      return { matched, skipped };
    }
    const tierSkipped = matched.filter(
      (c) => c.tier == null || (cumulative ? c.tier > tierFilter : c.tier !== tierFilter),
    );
    const tierMatched = matched.filter(
      (c) => c.tier != null && (cumulative ? c.tier <= tierFilter : c.tier === tierFilter),
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

  it("--tier 2 keeps only tier 2 (exact match)", () => {
    const result = applyTierFilter(concerns, [], 2);
    expect(result.matched.map((c) => c.id)).toEqual([
      "idempotency-boundaries",
    ]);
    expect(result.skipped).toHaveLength(3);
  });

  it("--tier 3 keeps only tier 3 (exact match)", () => {
    const result = applyTierFilter(concerns, [], 3);
    expect(result.matched.map((c) => c.id)).toEqual([
      "horizontal-traceability",
    ]);
    expect(result.skipped).toHaveLength(3);
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

  it("cumulative --tier 2 keeps tier 1 + 2", () => {
    const result = applyTierFilter(concerns, [], 2, true);
    expect(result.matched.map((c) => c.id)).toEqual([
      "feasibility-check",
      "idempotency-boundaries",
    ]);
    expect(result.skipped).toHaveLength(2);
  });

  it("cumulative --tier 3 keeps tier 1 + 2 + 3, excludes interactions", () => {
    const result = applyTierFilter(concerns, [], 3, true);
    expect(result.matched.map((c) => c.id)).toEqual([
      "feasibility-check",
      "idempotency-boundaries",
      "horizontal-traceability",
    ]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.id).toBe("cache-ix");
  });

  it("tier 1 exact === tier 1 cumulative (same result for lowest tier)", () => {
    const exact = applyTierFilter(concerns, [], 1, false);
    const cumulative = applyTierFilter(concerns, [], 1, true);
    expect(exact.matched.map((c) => c.id)).toEqual(cumulative.matched.map((c) => c.id));
    expect(exact.skipped.map((c) => c.id)).toEqual(cumulative.skipped.map((c) => c.id));
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

describe("applyDriftFilters", () => {
  const drifts: DriftFinding[] = [
    makeDrift({ id: "e1", severity: "error" }),
    makeDrift({ id: "w1", severity: "warn" }),
    makeDrift({ id: "n1", severity: "note" }),
  ];

  it("filters by severity threshold", () => {
    const kept = applyDriftFilters(drifts, { severity_threshold: "warn" }, undefined);
    expect(kept.map((d) => d.id)).toEqual(["e1", "w1"]);
  });

  it("excludes by code-reality location at a path boundary", () => {
    const kept = applyDriftFilters(
      drifts,
      undefined,
      [{ component: "src/http.ts", reason: "legacy" }],
    );
    expect(kept).toHaveLength(0);
  });

  it("does not over-match a prefix that is not a path boundary", () => {
    // excluding "src/http" must NOT suppress findings located in "src/http.ts"
    const d = [makeDrift({ id: "x", codeReality: { text: "t", location: "src/http2.ts:1" } })];
    const kept = applyDriftFilters(d, undefined, [{ component: "src/http", reason: "x" }]);
    expect(kept).toHaveLength(1);
  });

  it("does not exclude based on the doc-claim location (component is code-side only)", () => {
    // a doc label like "src/http.ts" appearing in docClaim must not trigger exclusion
    const d = [makeDrift({ id: "y", docClaim: { text: "t", location: "src/http.ts" }, codeReality: { text: "t", location: "ADD:4" } })];
    const kept = applyDriftFilters(d, undefined, [{ component: "src/http.ts", reason: "x" }]);
    expect(kept).toHaveLength(1);
  });

  it("keeps everything with no filters", () => {
    expect(applyDriftFilters(drifts, undefined, undefined)).toHaveLength(3);
  });
});

describe("lint in reconcile mode", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-reconcile-"));
    // a reconcile project: an ADD doc + source code + manifest
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "docs/add.md"),
      "# Architecture\nThe HTTP client retries 3 times against the payment API.",
    );
    fs.writeFileSync(
      path.join(tmpDir, "src/http.ts"),
      "const maxRetries = 5;\napp.post('/charge', handler);",
    );
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "recon", dependencies: { express: "^4", stripe: "^14" } }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "doc-lint.yaml"),
      [
        'version: "1.0"',
        "mode: reconcile",
        "project:",
        "  name: recon",
        "documents:",
        "  required:",
        "    - role: add",
        "      path: docs/add.md",
        "code:",
        '  paths: ["."]',
        "signals:",
        "  declared: [resilience-triad, external-api, payments]",
      ].join("\n"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const driftJson = JSON.stringify({
    drifts: [
      {
        id: "drift-1",
        drift_type: "value-mismatch",
        doc_claim: { text: "retries 3 times", location: "ADD" },
        code_reality: { text: "maxRetries = 5", location: "src/http.ts:1" },
        severity: "error",
        confidence: "high",
        explanation: "docs say 3, code uses 5",
        recommendation: "reconcile the value",
      },
    ],
  });

  it("produces drift findings and folds drift errors into the error count", async () => {
    const engine = makeStubEngine(driftJson);
    const result = await lint({
      projectPath: tmpDir,
      engine,
      contradiction: false,
    });

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0]!.driftType).toBe("value-mismatch");
    expect(result.summary.drifts).toBe(1);
    // drift error must drive the overall error count (→ exit code 1)
    expect(result.summary.errors).toBeGreaterThanOrEqual(1);

    // the drift prompt must carry REAL extracted code facts + the authored doc —
    // guards against a broken buildCodeMap / prompt assembly (not tautological).
    const drift = engine.seen.find((p) => p.type === "drift");
    expect(drift).toBeDefined();
    expect(drift!.user).toContain("/charge"); // route extracted from src/http.ts
    expect(drift!.user).toContain("stripe"); // dependency from package.json
    expect(drift!.user).toContain("retries 3 times"); // authored doc text from docs/add.md
  });

  it("injects the code map only into code-aware concerns, not every concern", async () => {
    const engine = makeStubEngine(driftJson);
    await lint({ projectPath: tmpDir, engine, contradiction: false });

    const concernPrompts = engine.seen.filter((p) => p.type === "concern");
    const withCode = concernPrompts.filter((p) => p.user.includes("Code Map (extracted from source)"));
    // only the code-aware parity concerns (e.g. dependency-drift) should carry code
    expect(withCode.length).toBeGreaterThan(0);
    expect(withCode.length).toBeLessThan(concernPrompts.length);
    // resilience-triad is a doc concern — must NOT receive code facts
    const resilience = concernPrompts.find((p) => p.concernId === "resilience-triad");
    expect(resilience?.user.includes("Code Map (extracted from source)")).toBe(false);
  });

  it("suppresses the drift scanner when drift is disabled", async () => {
    const result = await lint({
      projectPath: tmpDir,
      engine: makeStubEngine(driftJson),
      contradiction: false,
      drift: false,
    });

    expect(result.drifts).toHaveLength(0);
    expect(result.summary.drifts).toBe(0);
  });
});

describe("lint rejects code-first (onboarding, not a lint mode)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-cf-reject-"));
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src/app.ts"), "app.get('/x', h);");
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "cf", dependencies: { express: "^4" } }));
    fs.writeFileSync(
      path.join(tmpDir, "doc-lint.yaml"),
      ['version: "1.0"', "mode: code-first", "project:", "  name: cf", "code:", '  paths: ["."]', "signals:", "  declared: [rest-api]"].join("\n"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("directs the user to bootstrap instead of linting synthesized docs", async () => {
    const noopEngine = { evaluate: () => Promise.resolve({ ok: true as const, content: "{}" }) };
    await expect(lint({ projectPath: tmpDir, engine: noopEngine, mode: "code-first" })).rejects.toThrow(
      /bootstrap/i,
    );
  });

  it("assemble() also rejects code-first (no empty-doc prompt set)", async () => {
    await expect(assemble({ projectPath: tmpDir, mode: "code-first" })).rejects.toThrow(/bootstrap/i);
  });
});
