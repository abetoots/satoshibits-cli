import { describe, it, expect } from "vitest";

import { buildEvaluationPrompt, buildContradictionPrompt, buildDriftPrompt, formatCodeMapBlock } from "../../src/core/prompt-builder.js";

import type { LoadedDocument } from "../../src/core/documents.js";
import type { CodeMap, LoadedConcern } from "../../src/types/index.js";
import { loadAllConcerns } from "../../src/core/concerns.js";

function makeDocs(): LoadedDocument[] {
  return [
    { role: "brd", label: "BRD", path: "docs/brd.md", content: "# BRD\nSample business requirements." },
    { role: "frd", label: "FRD", path: "docs/frd.md", content: "# FRD\nSample functional requirements." },
    { role: "add", label: "ADD", path: "docs/add.md", content: "# ADD\nSample architecture design." },
  ];
}

function makeCodeMap(over: Partial<CodeMap> = {}): CodeMap {
  return {
    root: "/project",
    tree: "src/\n  server.ts",
    packages: [{ name: "app", path: "package.json", dependencies: ["express", "stripe"], devDependencies: [], scripts: {}, engines: {} }],
    entrypoints: [],
    routes: [{ method: "POST", path: "/charge", file: "src/server.ts", line: 10, confidence: "high" }],
    models: [],
    externalCalls: [{ target: "stripe", kind: "sdk", file: "src/pay.ts", line: 3, confidence: "high" }],
    apiSurface: [],
    envVars: ["STRIPE_KEY"],
    configSignals: ["docker"],
    fileCount: 5,
    sampledFiles: 5,
    coverage: { scannedPaths: [], ignoredPaths: [], sampledOutPaths: [], unsupportedLanguages: [] },
    ...over,
  };
}

describe("prompt-builder", () => {
  describe("buildEvaluationPrompt", () => {
    it("builds a prompt for a core concern", () => {
      const concerns = loadAllConcerns();
      const idempotency = concerns.find((c) => c.id === "idempotency-boundaries")!;
      const docs = makeDocs();

      const prompt = buildEvaluationPrompt(idempotency, docs);

      expect(prompt.concernId).toBe("idempotency-boundaries");
      expect(prompt.concernVersion).toBe("1.0");
      expect(prompt.type).toBe("concern");
      expect(prompt.system).toContain("Idempotency");
      expect(prompt.user).toContain("idempotency-boundaries");
      expect(prompt.user).toContain("Sample business requirements");
      expect(prompt.metadata.documentsIncluded).toEqual(["docs/brd.md", "docs/frd.md", "docs/add.md"]);
    });

    it("builds a prompt for an interaction", () => {
      const concerns = loadAllConcerns();
      const asyncApproval = concerns.find((c) => c.id === "async-times-approval")!;
      const docs = makeDocs();

      const prompt = buildEvaluationPrompt(asyncApproval, docs);

      expect(prompt.concernId).toBe("async-times-approval");
      expect(prompt.type).toBe("interaction");
      expect(prompt.system).toContain("Async Workflows");
    });

    it("includes all document content in the prompt", () => {
      const concerns = loadAllConcerns();
      const concern = concerns[0]!;
      const docs = makeDocs();

      const prompt = buildEvaluationPrompt(concern, docs);

      expect(prompt.user).toContain("Sample business requirements");
      expect(prompt.user).toContain("Sample functional requirements");
      expect(prompt.user).toContain("Sample architecture design");
    });
  });

  describe("buildContradictionPrompt", () => {
    it("builds a contradiction detection prompt", () => {
      const docs = makeDocs();
      const prompt = buildContradictionPrompt(docs);

      expect(prompt.concernId).toBe("contradiction-scanner");
      expect(prompt.type).toBe("contradiction");
      expect(prompt.user).toContain("Contradiction");
      expect(prompt.user).toContain("Sample business requirements");
    });
  });

  describe("inline=false (reference mode)", () => {
    it("buildEvaluationPrompt uses path references instead of content", () => {
      const concerns = loadAllConcerns();
      const concern = concerns.find((c) => c.id === "idempotency-boundaries")!;
      const docs = makeDocs();

      const prompt = buildEvaluationPrompt(concern, docs, false);

      // should NOT contain document content
      expect(prompt.user).not.toContain("Sample business requirements");
      expect(prompt.user).not.toContain("Sample functional requirements");
      expect(prompt.user).not.toContain("Sample architecture design");

      // should contain file path references
      expect(prompt.user).toContain("Read the following files fully before evaluation:");
      expect(prompt.user).toContain("`docs/brd.md`");
      expect(prompt.user).toContain("`docs/frd.md`");
      expect(prompt.user).toContain("`docs/add.md`");

      // should contain document labels and roles
      expect(prompt.user).toContain("**BRD** (brd)");
      expect(prompt.user).toContain("**FRD** (frd)");
      expect(prompt.user).toContain("**ADD** (add)");
    });

    it("buildEvaluationPrompt populates documents array in reference mode", () => {
      const concerns = loadAllConcerns();
      const concern = concerns.find((c) => c.id === "idempotency-boundaries")!;
      const docs = makeDocs();

      const prompt = buildEvaluationPrompt(concern, docs, false);

      expect(prompt.documents).toBeDefined();
      expect(prompt.documents).toHaveLength(3);
      expect(prompt.documents).toEqual([
        { role: "brd", label: "BRD", path: "docs/brd.md" },
        { role: "frd", label: "FRD", path: "docs/frd.md" },
        { role: "add", label: "ADD", path: "docs/add.md" },
      ]);
    });

    it("buildEvaluationPrompt omits documents array in inline mode", () => {
      const concerns = loadAllConcerns();
      const concern = concerns.find((c) => c.id === "idempotency-boundaries")!;
      const docs = makeDocs();

      const prompt = buildEvaluationPrompt(concern, docs, true);

      expect(prompt.documents).toBeUndefined();
      // content should be inlined
      expect(prompt.user).toContain("Sample business requirements");
    });

    it("buildContradictionPrompt uses path references in reference mode", () => {
      const docs = makeDocs();
      const prompt = buildContradictionPrompt(docs, false);

      expect(prompt.user).not.toContain("Sample business requirements");
      expect(prompt.user).toContain("Read the following files fully before evaluation:");
      expect(prompt.user).toContain("`docs/brd.md`");
    });

    it("buildContradictionPrompt populates documents array in reference mode", () => {
      const docs = makeDocs();
      const prompt = buildContradictionPrompt(docs, false);

      expect(prompt.documents).toBeDefined();
      expect(prompt.documents).toHaveLength(3);
      expect(prompt.documents![0]).toEqual({ role: "brd", label: "BRD", path: "docs/brd.md" });
    });

    it("buildContradictionPrompt omits documents array in inline mode", () => {
      const docs = makeDocs();
      const prompt = buildContradictionPrompt(docs);

      expect(prompt.documents).toBeUndefined();
    });

    it("metadata.documentsIncluded is always populated regardless of inline mode", () => {
      const concerns = loadAllConcerns();
      const concern = concerns[0]!;
      const docs = makeDocs();

      const inlinePrompt = buildEvaluationPrompt(concern, docs, true);
      const refPrompt = buildEvaluationPrompt(concern, docs, false);

      expect(inlinePrompt.metadata.documentsIncluded).toEqual(["docs/brd.md", "docs/frd.md", "docs/add.md"]);
      expect(refPrompt.metadata.documentsIncluded).toEqual(["docs/brd.md", "docs/frd.md", "docs/add.md"]);
    });
  });

  describe("tier-aware system messages", () => {
    const docs = makeDocs();

    function findConcernByTier(tier: number): LoadedConcern {
      const concerns = loadAllConcerns();
      const match = concerns.find((c) => c.tier === tier && c.type === "concern");
      if (!match) throw new Error(`No concern found with tier ${tier}`);
      return match;
    }

    it("tier 1 concern includes tier 1 context in system message", () => {
      const concern = findConcernByTier(1);
      const prompt = buildEvaluationPrompt(concern, docs);
      expect(prompt.system).toContain("Tier 1");
      expect(prompt.system).toContain("Foundational");
    });

    it("tier 2 concern includes tier 2 context in system message", () => {
      const concern = findConcernByTier(2);
      const prompt = buildEvaluationPrompt(concern, docs);
      expect(prompt.system).toContain("Tier 2");
      expect(prompt.system).toContain("Behavioral");
    });

    it("tier 3 concern includes tier 3 context in system message", () => {
      const concern = findConcernByTier(3);
      const prompt = buildEvaluationPrompt(concern, docs);
      expect(prompt.system).toContain("Tier 3");
      expect(prompt.system).toContain("Structural");
    });

    it("interaction does NOT include tier context", () => {
      const concerns = loadAllConcerns();
      const interaction = concerns.find((c) => c.type === "interaction")!;
      const prompt = buildEvaluationPrompt(interaction, docs);
      expect(prompt.system).not.toContain("Tier 1");
      expect(prompt.system).not.toContain("Tier 2");
      expect(prompt.system).not.toContain("Tier 3");
      expect(prompt.system).not.toContain("Foundational");
      expect(prompt.system).not.toContain("Behavioral");
      expect(prompt.system).not.toContain("Structural");
    });

    it("untiered concern does NOT include tier context", () => {
      const concerns = loadAllConcerns();
      const untiered = concerns.find((c) => c.type === "concern" && c.tier == null);
      if (!untiered) return; // skip if all concerns have tiers
      const prompt = buildEvaluationPrompt(untiered, docs);
      expect(prompt.system).not.toContain("Tier 1");
      expect(prompt.system).not.toContain("Tier 2");
      expect(prompt.system).not.toContain("Tier 3");
      expect(prompt.system).not.toContain("Foundational");
      expect(prompt.system).not.toContain("Behavioral");
      expect(prompt.system).not.toContain("Structural");
    });
  });

  describe("formatCodeMapBlock", () => {
    it("renders facts and an explicit coverage section", () => {
      const block = formatCodeMapBlock(makeCodeMap());
      expect(block).toContain("POST /charge (src/server.ts:10)");
      expect(block).toContain("stripe");
      expect(block).toContain("STRIPE_KEY");
      expect(block).toContain("Coverage (READ THIS)");
      expect(block).toContain("do not assume absence");
    });

    it("surfaces token-budget drops in the coverage section", () => {
      const block = formatCodeMapBlock(
        makeCodeMap({ coverage: { scannedPaths: [], ignoredPaths: [], sampledOutPaths: ["a.ts", "b.ts"], unsupportedLanguages: ["py"] } }),
      );
      expect(block).toContain("Dropped by token budget");
      expect(block).toContain("Unsupported (not analyzed): py");
    });
  });

  describe("buildDriftPrompt", () => {
    it("builds a drift prompt with docs and code map", () => {
      const prompt = buildDriftPrompt(makeDocs(), makeCodeMap());
      expect(prompt.concernId).toBe("drift-scanner");
      expect(prompt.type).toBe("drift");
      expect(prompt.user).toContain("Sample business requirements"); // docs
      expect(prompt.user).toContain("POST /charge"); // code facts
      expect(prompt.user).toContain("not scanned"); // coverage guidance
      expect(prompt.system).toContain("reconciliation validator");
    });
  });

  describe("buildEvaluationPrompt with code map", () => {
    it("appends code facts to a concern prompt in reconcile mode", () => {
      const concern = loadAllConcerns()[0]!;
      const prompt = buildEvaluationPrompt(concern, makeDocs(), true, makeCodeMap());
      expect(prompt.user).toContain("Code Map (extracted from source)");
      expect(prompt.user).toContain("POST /charge");
    });
  });

  describe("lens framing", () => {
    it("docs lens (default) is byte-identical to no lens", () => {
      const concern = loadAllConcerns().find((c) => c.id === "idempotency-boundaries")!;
      const docs = makeDocs();
      const noLens = buildEvaluationPrompt(concern, docs);
      const docsLens = buildEvaluationPrompt(concern, docs, true, undefined, "docs");
      expect(docsLens.system).toBe(noLens.system);
      expect(docsLens.user).toBe(noLens.user);
    });

    it("code lens reframes the question toward the system as implemented", () => {
      const concern = loadAllConcerns().find((c) => c.id === "idempotency-boundaries")!;
      const prompt = buildEvaluationPrompt(concern, makeDocs(), true, undefined, "code");
      expect(prompt.system).toContain("CODE AUDIT");
      expect(prompt.system).toContain("SYSTEM AS IMPLEMENTED");
      // it must NOT turn into a "is it documented" check in this lens
      expect(prompt.system).toContain("Do NOT report 'undocumented'");
      // user prompt (concern YAML + docs) is unchanged — framing rides on the system msg
      const docsLensUser = buildEvaluationPrompt(concern, makeDocs(), true, undefined, "docs").user;
      expect(prompt.user).toBe(docsLensUser);
    });

    it("reconcile lens reframes the question toward doc↔code agreement", () => {
      const concern = loadAllConcerns().find((c) => c.id === "idempotency-boundaries")!;
      const prompt = buildEvaluationPrompt(concern, makeDocs(), true, undefined, "reconcile");
      expect(prompt.system).toContain("RECONCILE");
      expect(prompt.system).toContain("AGREEMENT");
    });
  });

  describe("reference-mode code roots", () => {
    it("renders a Source code block and sets codeRoots in reference mode", () => {
      const concern = loadAllConcerns().find((c) => c.id === "idempotency-boundaries")!;
      const prompt = buildEvaluationPrompt(concern, makeDocs(), false, undefined, "code", ["src", "lib"]);
      expect(prompt.user).toContain("## Source code");
      expect(prompt.user).toContain("`src`");
      expect(prompt.user).toContain("`lib`");
      expect(prompt.codeRoots).toEqual(["src", "lib"]);
    });

    it("does NOT render code roots in inline mode (code isn't inlined)", () => {
      const concern = loadAllConcerns().find((c) => c.id === "idempotency-boundaries")!;
      const prompt = buildEvaluationPrompt(concern, makeDocs(), true, undefined, "code", ["src"]);
      expect(prompt.user).not.toContain("## Source code");
      expect(prompt.codeRoots).toBeUndefined();
    });

    it("omits code roots when none are provided (docs-only reference mode)", () => {
      const concern = loadAllConcerns().find((c) => c.id === "idempotency-boundaries")!;
      const prompt = buildEvaluationPrompt(concern, makeDocs(), false);
      expect(prompt.user).not.toContain("## Source code");
      expect(prompt.codeRoots).toBeUndefined();
    });
  });
});
