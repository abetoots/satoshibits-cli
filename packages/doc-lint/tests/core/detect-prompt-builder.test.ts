import { describe, it, expect } from "vitest";

import { buildDetectPrompt } from "../../src/core/detect-prompt-builder.js";
import { SIGNAL_KEYWORDS } from "../../src/core/signal-keywords.js";

import type { LoadedDocument } from "../../src/core/documents.js";

function makeDocs(overrides?: Partial<LoadedDocument>[]): LoadedDocument[] {
  const defaults: LoadedDocument[] = [
    {
      role: "brd",
      label: "BRD",
      path: "docs/brd.md",
      content: "# Business Requirements\nPayment processing system.",
    },
    {
      role: "frd",
      label: "FRD",
      path: "docs/frd.md",
      content: "# Functional Requirements\nREST API endpoints.",
    },
  ];
  if (overrides) {
    return overrides.map((o, i) => ({ ...defaults[i % defaults.length]!, ...o }));
  }
  return defaults;
}

describe("buildDetectPrompt", () => {
  it("returns a DetectResult with system and user prompts", () => {
    const result = buildDetectPrompt("My Project", makeDocs());

    expect(result.project).toBe("My Project");
    expect(result.timestamp).toBeTruthy();
    expect(result.documents).toEqual(["docs/brd.md", "docs/frd.md"]);
    expect(result.prompt.system).toContain("documentation signal detector");
    expect(result.prompt.user).toContain("Signal Detection");
  });

  it("includes all signals from the vocabulary", () => {
    const result = buildDetectPrompt("Test", makeDocs());
    const signalCount = Object.keys(SIGNAL_KEYWORDS).length;

    expect(result.prompt.user).toContain(`Signal Vocabulary (${signalCount} signals)`);

    // spot-check a few signals are present
    expect(result.prompt.user).toContain("**authentication**");
    expect(result.prompt.user).toContain("**payments**");
    expect(result.prompt.user).toContain("**rate-limiting**");
  });

  it("includes document content in the prompt", () => {
    const result = buildDetectPrompt("Test", makeDocs());

    expect(result.prompt.user).toContain("Business Requirements");
    expect(result.prompt.user).toContain("Payment processing system.");
    expect(result.prompt.user).toContain("REST API endpoints.");
  });

  it("includes the JSON response schema", () => {
    const result = buildDetectPrompt("Test", makeDocs());

    expect(result.prompt.user).toContain("Response Schema");
    expect(result.prompt.user).toContain('"signals"');
    expect(result.prompt.user).toContain('"confidence"');
    expect(result.prompt.user).toContain('"rationale"');
    expect(result.prompt.user).toContain('"unmappedConcepts"');
  });

  it("includes document labels and paths in the prompt", () => {
    const result = buildDetectPrompt("Test", makeDocs());

    expect(result.prompt.user).toContain("BRD (`docs/brd.md`)");
    expect(result.prompt.user).toContain("FRD (`docs/frd.md`)");
  });

  it("system prompt instructs closed-set validation", () => {
    const result = buildDetectPrompt("Test", makeDocs());

    expect(result.prompt.system).toContain("ONLY return signals from the provided vocabulary");
  });

  it("system prompt instructs JSON-only response", () => {
    const result = buildDetectPrompt("Test", makeDocs());

    expect(result.prompt.system).toContain("No markdown fences");
    expect(result.prompt.system).toContain("just the JSON object");
  });

  it("lists signals in alphabetical order", () => {
    const result = buildDetectPrompt("Test", makeDocs());
    const signalNames = Object.keys(SIGNAL_KEYWORDS).sort();

    // first and last alphabetically should appear in order
    const firstIdx = result.prompt.user.indexOf(`**${signalNames[0]}**`);
    const lastIdx = result.prompt.user.indexOf(`**${signalNames[signalNames.length - 1]}**`);
    expect(firstIdx).toBeLessThan(lastIdx);
  });

  describe("inline=false (reference mode)", () => {
    it("uses path references instead of inlining content", () => {
      const result = buildDetectPrompt("Test", makeDocs(), { inline: false, projectRoot: "/my/project" });

      // should NOT contain document content
      expect(result.prompt.user).not.toContain("Payment processing system.");
      expect(result.prompt.user).not.toContain("REST API endpoints.");

      // should contain file path references
      expect(result.prompt.user).toContain("Read the following files fully before analysis:");
      expect(result.prompt.user).toContain("`docs/brd.md`");
      expect(result.prompt.user).toContain("`docs/frd.md`");
    });

    it("sets projectRoot when inline=false", () => {
      const result = buildDetectPrompt("Test", makeDocs(), { inline: false, projectRoot: "/my/project" });
      expect(result.projectRoot).toBe("/my/project");
    });

    it("populates documentRefs when inline=false", () => {
      const result = buildDetectPrompt("Test", makeDocs(), { inline: false, projectRoot: "/my/project" });

      expect(result.documentRefs).toBeDefined();
      expect(result.documentRefs).toHaveLength(2);
      expect(result.documentRefs).toEqual([
        { role: "brd", label: "BRD", path: "docs/brd.md" },
        { role: "frd", label: "FRD", path: "docs/frd.md" },
      ]);
    });

    it("omits projectRoot and documentRefs in default inline mode", () => {
      const result = buildDetectPrompt("Test", makeDocs());

      expect(result.projectRoot).toBeUndefined();
      expect(result.documentRefs).toBeUndefined();
    });

    it("treats missing options as inline=true", () => {
      const result = buildDetectPrompt("Test", makeDocs());

      expect(result.prompt.user).toContain("Payment processing system.");
      expect(result.prompt.user).not.toContain("Read the following files fully before analysis:");
    });

    it("defaults projectRoot to cwd when not provided in reference mode", () => {
      const result = buildDetectPrompt("Test", makeDocs(), { inline: false });
      expect(result.projectRoot).toBe(process.cwd());
    });

    it("documents array is always populated regardless of inline mode", () => {
      const inlineResult = buildDetectPrompt("Test", makeDocs());
      const refResult = buildDetectPrompt("Test", makeDocs(), { inline: false });

      expect(inlineResult.documents).toEqual(["docs/brd.md", "docs/frd.md"]);
      expect(refResult.documents).toEqual(["docs/brd.md", "docs/frd.md"]);
    });
  });
});
