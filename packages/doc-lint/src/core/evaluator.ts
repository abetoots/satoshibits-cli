import { loadManifest } from "./manifest.js";
import { loadDocuments } from "./documents.js";
import { loadAllConcerns } from "./concerns.js";
import { matchConcerns } from "./signals.js";
import { buildEvaluationPrompt, buildContradictionPrompt } from "./prompt-builder.js";
import { parseEvaluationResponse, parseContradictionResponse } from "./response-parser.js";

import type { EvaluationEngine } from "./engine/types.js";
import type {
  AssembledPrompt,
  AssembleResult,
  Finding,
  ContradictionFinding,
  LintResult,
} from "../types/index.js";

export interface AssembleInput {
  projectPath: string;
  configPath?: string;
  contradiction?: boolean;
  filterConcernIds?: string[];
}

export interface LintInput extends AssembleInput {
  engine: EvaluationEngine;
  verbose?: boolean;
  onProgress?: (message: string) => void;
}

export function assemble(input: AssembleInput): AssembleResult {
  const manifest = loadManifest(input.projectPath, input.configPath);
  const docs = loadDocuments(manifest, input.projectPath);
  const allConcerns = loadAllConcerns();

  const filterIds = input.filterConcernIds;
  const { matched, skipped } = matchConcerns(manifest.signals.declared, allConcerns, filterIds);

  const prompts: AssembledPrompt[] = [];

  for (const concern of matched) {
    const prompt = buildEvaluationPrompt(concern, docs.all);
    prompts.push(prompt);
  }

  // contradiction scanner runs on all docs unless disabled
  const enableContradiction = input.contradiction !== false;
  if (enableContradiction) {
    const contradictionPrompt = buildContradictionPrompt(docs.all);
    prompts.push(contradictionPrompt);
  }

  return {
    version: "1.0",
    timestamp: new Date().toISOString(),
    project: manifest.project.name,
    signals: manifest.signals.declared,
    concerns: {
      matched: matched.map((c) => c.id),
      skipped: skipped.map((c) => c.id),
    },
    prompts,
  };
}

// lint composes assemble — the two-layer architecture is enforced structurally
export async function lint(input: LintInput): Promise<LintResult> {
  const assembled = assemble(input);
  // noop when no progress callback provided
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op fallback
  const progress = input.onProgress ?? ((_msg: string) => {});

  const findings: Finding[] = [];
  const contradictions: ContradictionFinding[] = [];

  for (const prompt of assembled.prompts) {
    if (prompt.type === "contradiction") {
      progress("Running contradiction scanner...");
      const result = await input.engine.evaluate(prompt);

      if (result.ok) {
        const parsed = parseContradictionResponse(result.content);
        if (parsed.parseError) {
          progress(`  Warning: ${parsed.parseError}`);
        }
        contradictions.push(...parsed.contradictions);
      } else {
        progress(`  Error: ${result.error}`);
      }
    } else {
      progress(`Evaluating: ${prompt.concernName} (${prompt.concernId})`);
      const result = await input.engine.evaluate(prompt);

      if (result.ok) {
        const parsed = parseEvaluationResponse(result.content, prompt.concernId);
        if (parsed.parseError) {
          progress(`  Warning: ${parsed.parseError}`);
        }
        findings.push(...parsed.findings);
      } else {
        progress(`  Error: ${result.error}`);
      }
    }
  }

  const findingErrors = findings.filter((f) => f.severity === "error").length;
  const contradictionErrors = contradictions.filter((c) => c.severity === "error").length;
  const errors = findingErrors + contradictionErrors;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const notes = findings.filter((f) => f.severity === "note").length;
  const humanReview = findings.filter((f) => f.requiresHumanReview).length;

  return {
    version: "1.0",
    timestamp: new Date().toISOString(),
    project: assembled.project,
    signals: assembled.signals,
    concerns: assembled.concerns,
    findings,
    contradictions,
    summary: {
      totalFindings: findings.length,
      errors,
      warnings,
      notes,
      contradictions: contradictions.length,
      humanReviewRequired: humanReview,
    },
  };
}
