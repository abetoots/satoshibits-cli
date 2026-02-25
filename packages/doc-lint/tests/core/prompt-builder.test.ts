import { describe, it, expect } from "vitest";

import { buildEvaluationPrompt, buildContradictionPrompt } from "../../src/core/prompt-builder.js";

import type { LoadedDocument } from "../../src/core/documents.js";
import { loadAllConcerns } from "../../src/core/concerns.js";

function makeDocs(): LoadedDocument[] {
  return [
    { role: "brd", label: "BRD", path: "docs/brd.md", content: "# BRD\nSample business requirements." },
    { role: "frd", label: "FRD", path: "docs/frd.md", content: "# FRD\nSample functional requirements." },
    { role: "add", label: "ADD", path: "docs/add.md", content: "# ADD\nSample architecture design." },
  ];
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
});
