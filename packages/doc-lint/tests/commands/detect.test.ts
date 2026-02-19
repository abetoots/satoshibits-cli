import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { detectCommand } from "../../src/commands/detect.js";
import type { DetectResult } from "../../src/core/detect-prompt-builder.js";

const fixtureProject = path.resolve(
  import.meta.dirname,
  "../fixtures/sample-project",
);

function getLoggedString(): string {
  const raw: unknown = vi.mocked(console.log).mock.calls[0]?.[0];
  if (typeof raw !== "string") throw new Error("Expected string log output");
  return raw;
}

function getLoggedJson(): DetectResult {
  const raw = getLoggedString();
  return JSON.parse(raw) as DetectResult;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockReturnValue(undefined);
  vi.spyOn(console, "error").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectCommand", () => {
  it("errors when neither -f nor -o is set", async () => {
    const code = await detectCommand(fixtureProject, {});
    expect(code).toBe(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("specify an output mode"),
    );
  });

  it("outputs JSON to stdout with -f json", async () => {
    const code = await detectCommand(fixtureProject, { format: "json" });
    expect(code).toBe(0);

    const parsed = getLoggedJson();

    expect(parsed.project).toBe("Sample Payment System");
    expect(parsed.prompt.system).toContain("signal detector");
    expect(parsed.prompt.user).toContain("Signal Detection");
    expect(parsed.documents).toContain("docs/brd.md");
  });

  it("outputs human-readable format with -f human", async () => {
    const code = await detectCommand(fixtureProject, { format: "human" });
    expect(code).toBe(0);

    const output = getLoggedString();
    expect(output).toContain("doc-lint detect: Sample Payment System");
    expect(output).toContain("System Message");
    expect(output).toContain("Prompt");
  });

  it("writes signal-detection.md with -o", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-detect-"));

    try {
      const code = await detectCommand(fixtureProject, { outputDir: tmpDir });
      expect(code).toBe(0);

      const filePath = path.join(tmpDir, "signal-detection.md");
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("type: signal-detection");
      expect(content).toContain("project: Sample Payment System");
      expect(content).toContain("## System Message");
      expect(content).toContain("## Prompt");
      expect(content).toContain("Signal Detection");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates nested output directories", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-detect-"));
    const nested = path.join(tmpDir, "a", "b");

    try {
      const code = await detectCommand(fixtureProject, { outputDir: nested });
      expect(code).toBe(0);
      expect(fs.existsSync(path.join(nested, "signal-detection.md"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes document content in the generated prompt", async () => {
    const code = await detectCommand(fixtureProject, { format: "json" });
    expect(code).toBe(0);

    const parsed = getLoggedJson();

    // sample-project docs contain payment-related content
    expect(parsed.prompt.user).toContain("Payment");
  });

  it("accepts a custom config path", async () => {
    const code = await detectCommand(fixtureProject, {
      format: "json",
      config: "doc-lint.yaml",
    });
    expect(code).toBe(0);
  });
});
