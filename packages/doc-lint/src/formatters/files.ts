import * as fs from "node:fs";
import * as path from "node:path";

import type { AssembleResult } from "../types/index.js";
import type { DetectResult } from "../core/detect-prompt-builder.js";

export function writeDetectFile(result: DetectResult, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });

  const filename = "signal-detection.md";
  const filePath = path.join(outputDir, filename);

  const lines: string[] = [];

  lines.push("---");
  lines.push("type: signal-detection");
  lines.push(`project: ${result.project}`);
  lines.push(`generated: ${result.timestamp}`);
  lines.push(`documents: ${result.documents.join(", ")}`);
  lines.push("---");
  lines.push("");
  lines.push("## System Message");
  lines.push("");
  lines.push(result.prompt.system);
  lines.push("");
  lines.push("## Prompt");
  lines.push("");
  lines.push(result.prompt.user);

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return filename;
}

export function writePromptFiles(result: AssembleResult, outputDir: string): string[] {
  fs.mkdirSync(outputDir, { recursive: true });

  const written: string[] = [];

  for (const prompt of result.prompts) {
    const filename = `${prompt.concernId}.md`;
    const filePath = path.join(outputDir, filename);

    const lines: string[] = [];

    // front-matter with metadata
    lines.push("---");
    lines.push(`concern: ${prompt.concernId}`);
    lines.push(`version: ${prompt.concernVersion}`);
    lines.push(`name: ${prompt.concernName}`);
    lines.push(`type: ${prompt.type}`);
    lines.push(`project: ${result.project}`);
    lines.push(`generated: ${result.timestamp}`);
    lines.push("---");
    lines.push("");

    // system message as a quoted block
    lines.push("## System Message");
    lines.push("");
    lines.push(prompt.system);
    lines.push("");

    // user prompt (the main content — contains concern YAML + documents)
    lines.push("## Prompt");
    lines.push("");
    lines.push(prompt.user);

    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    written.push(filename);
  }

  return written;
}
