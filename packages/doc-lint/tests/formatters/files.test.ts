import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { writePromptFiles } from "../../src/formatters/files.js";

import type { AssembleResult, SignalAnalysis } from "../../src/types/index.js";

function makeSignals(effective: string[]): SignalAnalysis {
  return { declared: effective, detected: [], effective };
}

function makeResult(overrides?: Partial<AssembleResult>): AssembleResult {
  return {
    version: "2.0",
    timestamp: "2026-02-18T00:00:00Z",
    project: "Test Project",
    signals: makeSignals(["payments", "webhooks"]),
    concerns: { matched: ["idempotency-boundaries"], skipped: [] },
    prompts: [
      {
        concernId: "idempotency-boundaries",
        concernVersion: "1.0",
        concernName: "Idempotency Boundaries",
        type: "concern",
        system: "You are a documentation validator.",
        user: "# Evaluation\n\nEvaluate the documents.",
        responseSchema: {},
        metadata: { documentsIncluded: ["brd", "frd"], templateVersion: "1.0" },
      },
      {
        concernId: "contradiction-scanner",
        concernVersion: "1.0",
        concernName: "Cross-Document Contradiction Scanner",
        type: "contradiction",
        system: "You are a contradiction detector.",
        user: "# Contradiction Check\n\nScan for contradictions.",
        responseSchema: {},
        metadata: { documentsIncluded: ["brd", "frd"], templateVersion: "1.0" },
      },
    ],
    ...overrides,
  };
}

describe("writePromptFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".test-output-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes one .md file per prompt", () => {
    const result = makeResult();
    const written = writePromptFiles(result, tmpDir);

    expect(written).toEqual([
      "idempotency-boundaries.md",
      "contradiction-scanner.md",
    ]);

    for (const filename of written) {
      expect(fs.existsSync(path.join(tmpDir, filename))).toBe(true);
    }
  });

  it("includes YAML front-matter with metadata", () => {
    const result = makeResult();
    writePromptFiles(result, tmpDir);

    const content = fs.readFileSync(
      path.join(tmpDir, "idempotency-boundaries.md"),
      "utf8",
    );

    expect(content).toMatch(/^---\n/);
    expect(content).toContain("concern: idempotency-boundaries");
    expect(content).toContain("version: 1.0");
    expect(content).toContain("name: Idempotency Boundaries");
    expect(content).toContain("type: concern");
    expect(content).toContain("project: Test Project");
    expect(content).toContain("---");
  });

  it("includes system message and user prompt", () => {
    const result = makeResult();
    writePromptFiles(result, tmpDir);

    const content = fs.readFileSync(
      path.join(tmpDir, "idempotency-boundaries.md"),
      "utf8",
    );

    expect(content).toContain("## System Message");
    expect(content).toContain("You are a documentation validator.");
    expect(content).toContain("## Prompt");
    expect(content).toContain("Evaluate the documents.");
  });

  it("creates output directory if it does not exist", () => {
    const nested = path.join(tmpDir, "a", "b", "c");
    const result = makeResult();
    const written = writePromptFiles(result, nested);

    expect(written.length).toBe(2);
    expect(fs.existsSync(path.join(nested, "idempotency-boundaries.md"))).toBe(true);
  });

  it("returns empty array for result with no prompts", () => {
    const result = makeResult({ prompts: [] });
    const written = writePromptFiles(result, tmpDir);

    expect(written).toEqual([]);
    // directory still created
    expect(fs.existsSync(tmpDir)).toBe(true);
  });
});
