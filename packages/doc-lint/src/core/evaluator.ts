import type {
  AssembledPrompt,
  AssembleResult,
  ContradictionFinding,
  CoverageInfo,
  ExclusionEntry,
  Finding,
  LintResult,
  SignalAnalysis,
  ToleranceConfig,
} from "../types/index.js";
import type { EvaluationEngine } from "./engine/types.js";

import { loadAllConcerns } from "./concerns.js";
import { loadDocuments } from "./documents.js";
import { loadManifest } from "./manifest.js";
import {
  buildContradictionPrompt,
  buildEvaluationPrompt,
} from "./prompt-builder.js";
import {
  parseContradictionResponse,
  parseEvaluationResponse,
} from "./response-parser.js";
import { detectSignals, resolveDocumentPaths } from "./signal-keywords.js";
import { matchConcerns } from "./signals.js";

export interface AssembleInput {
  projectPath: string;
  configPath?: string;
  contradiction?: boolean;
  filterConcernIds?: string[];
  autoDetect?: boolean; // CLI override for manifest.signals.auto_detect
  warnOnMismatch?: boolean; // CLI override for manifest.signals.warn_on_mismatch
}

export interface LintInput extends AssembleInput {
  engine: EvaluationEngine;
  verbose?: boolean;
  onProgress?: (message: string) => void;
  tolerance?: ToleranceConfig;
  exclusions?: ExclusionEntry[];
}

// severity ordering for threshold filtering
const SEVERITY_RANK: Record<string, number> = { error: 3, warn: 2, note: 1 };

export function applyToleranceFilter(
  findings: Finding[],
  tolerance: ToleranceConfig | undefined,
): Finding[] {
  if (!tolerance?.severity_threshold) return findings;
  const minRank = SEVERITY_RANK[tolerance.severity_threshold] ?? 1;
  return findings.filter((f) => (SEVERITY_RANK[f.severity] ?? 0) >= minRank);
}

export function applyExclusionFilter(
  findings: Finding[],
  exclusions: ExclusionEntry[] | undefined,
): { kept: Finding[]; excluded: Finding[] } {
  if (!exclusions || exclusions.length === 0) {
    return { kept: findings, excluded: [] };
  }

  const excludedComponents = exclusions.flatMap((e) =>
    e.component ? [e.component] : [],
  );
  const kept: Finding[] = [];
  const excluded: Finding[] = [];

  for (const finding of findings) {
    const isExcluded = excludedComponents.some(
      (comp) =>
        finding.relatedItem === comp ||
        finding.relatedItem.startsWith(`${comp}.`),
    );
    if (isExcluded) {
      excluded.push(finding);
    } else {
      kept.push(finding);
    }
  }

  return { kept, excluded };
}

export function filterExcludedConcernPrompts(
  prompts: AssembledPrompt[],
  exclusions: ExclusionEntry[] | undefined,
): { kept: AssembledPrompt[]; excludedConcernIds: string[] } {
  if (!exclusions || exclusions.length === 0) {
    return { kept: prompts, excludedConcernIds: [] };
  }

  const excludedIds = new Set(
    exclusions.flatMap((e) => (e.concernId ? [e.concernId] : [])),
  );
  if (excludedIds.size === 0) {
    return { kept: prompts, excludedConcernIds: [] };
  }

  const kept: AssembledPrompt[] = [];
  const actuallyExcluded: string[] = [];

  for (const prompt of prompts) {
    // never filter contradiction prompts
    if (prompt.type === "contradiction" || !excludedIds.has(prompt.concernId)) {
      kept.push(prompt);
    } else {
      actuallyExcluded.push(prompt.concernId);
    }
  }

  return { kept, excludedConcernIds: actuallyExcluded };
}

export function buildCoverageInfo(input: {
  matched: string[];
  skipped: string[];
  excludedConcernIds: string[];
  documentsLoaded: string[];
  documentsMissing: string[];
}): CoverageInfo {
  // evaluated = matched minus excluded
  const excludedSet = new Set(input.excludedConcernIds);
  const evaluated = input.matched.filter((id) => !excludedSet.has(id));

  return {
    concernsEvaluated: evaluated,
    concernsSkipped: input.skipped,
    concernsExcluded: input.excludedConcernIds,
    documentsLoaded: input.documentsLoaded,
    documentsMissing: input.documentsMissing,
  };
}

export function assemble(input: AssembleInput): AssembleResult {
  const manifest = loadManifest(input.projectPath, input.configPath);
  const docs = loadDocuments(manifest, input.projectPath);
  const allConcerns = loadAllConcerns();

  // resolve auto_detect and warn_on_mismatch: CLI flag > manifest > default false
  const autoDetect = input.autoDetect ?? manifest.signals.auto_detect ?? false;
  const warnOnMismatch =
    input.warnOnMismatch ?? manifest.signals.warn_on_mismatch ?? false;
  const shouldDetect = autoDetect || warnOnMismatch;

  const declaredSignals = manifest.signals.declared;
  let detectedSignals: string[] = [];
  let effectiveSignals = declaredSignals;

  if (shouldDetect) {
    const docPaths = resolveDocumentPaths(
      input.projectPath,
      docs.all.map((d) => d.path),
    );
    const allDetected = detectSignals(docPaths);
    detectedSignals = allDetected
      .filter((s) => s.confidence === "high" || s.confidence === "medium")
      .map((s) => s.signal);
  }

  if (autoDetect) {
    // MERGE: union of declared + detected
    effectiveSignals = [...new Set([...declaredSignals, ...detectedSignals])];
  }

  const filterIds = input.filterConcernIds;
  const { matched, skipped } = matchConcerns(
    effectiveSignals,
    allConcerns,
    filterIds,
  );

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

  const signalAnalysis: SignalAnalysis = {
    declared: declaredSignals,
    detected: detectedSignals,
    effective: effectiveSignals,
  };

  if (warnOnMismatch) {
    const declaredSet = new Set(declaredSignals);
    const detectedSet = new Set(detectedSignals);
    const undeclared = detectedSignals.filter((s) => !declaredSet.has(s));
    const stale = declaredSignals.filter((s) => !detectedSet.has(s));
    if (undeclared.length > 0 || stale.length > 0) {
      signalAnalysis.mismatch = { undeclared, stale };
    }
  }

  const matchedDetails = matched.map((c) => ({
    id: c.id,
    tier: c.tier,
    type: c.type,
  }));

  return {
    version: "2.0",
    timestamp: new Date().toISOString(),
    project: manifest.project.name,
    signals: signalAnalysis,
    concerns: {
      matched: matched.map((c) => c.id),
      skipped: skipped.map((c) => c.id),
      matchedDetails,
    },
    prompts,
  };
}

// lint composes assemble — the two-layer architecture is enforced structurally
export async function lint(input: LintInput): Promise<LintResult> {
  const manifest = loadManifest(input.projectPath, input.configPath);
  const docs = loadDocuments(manifest, input.projectPath);
  const assembled = assemble(input);
  // noop when no progress callback provided
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op fallback
  const progress = input.onProgress ?? ((_msg: string) => {});

  if (assembled.signals.mismatch) {
    const { undeclared, stale } = assembled.signals.mismatch;
    if (undeclared.length > 0) {
      progress(
        `Warning: Signals detected in docs but not declared: ${undeclared.join(", ")}`,
      );
    }
    if (stale.length > 0) {
      progress(
        `Warning: Declared signals not found in docs: ${stale.join(", ")}`,
      );
    }
  }

  // resolve tolerance and exclusions: CLI flags override manifest
  const tolerance: ToleranceConfig | undefined =
    input.tolerance ?? manifest.tolerance;
  const exclusions: ExclusionEntry[] | undefined =
    input.exclusions ?? manifest.exclusions;

  // pre-evaluation: filter out prompts for excluded concern IDs (saves API calls)
  const { kept: activePrompts, excludedConcernIds: preExcludedConcernIds } =
    filterExcludedConcernPrompts(assembled.prompts, exclusions);

  if (preExcludedConcernIds.length > 0) {
    progress(`Skipping excluded concerns: ${preExcludedConcernIds.join(", ")}`);
  }

  let findings: Finding[] = [];
  const contradictions: ContradictionFinding[] = [];

  for (const prompt of activePrompts) {
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
        const parsed = parseEvaluationResponse(
          result.content,
          prompt.concernId,
        );
        if (parsed.parseError) {
          progress(`  Warning: ${parsed.parseError}`);
        }
        findings.push(...parsed.findings);
      } else {
        progress(`  Error: ${result.error}`);
      }
    }
  }

  // apply component-level exclusion filtering on findings
  const { kept, excluded } = applyExclusionFilter(findings, exclusions);
  findings = kept;
  // merge pre-evaluation concern exclusions with post-evaluation component exclusions
  const postExcludedConcernIds = [...new Set(excluded.map((f) => f.concernId))];
  const excludedConcernIds = [
    ...new Set([...preExcludedConcernIds, ...postExcludedConcernIds]),
  ];

  // apply tolerance filtering
  findings = applyToleranceFilter(findings, tolerance);

  // build coverage info
  const documentsLoaded = docs.all.map((d) => d.role);
  const allDeclaredOptional = [
    ...(manifest.documents.optional ?? []),
    ...(manifest.documents.contracts ?? []),
    ...(manifest.documents.operational ?? []),
    ...(manifest.documents.reference ?? []),
  ];
  const documentsMissing = allDeclaredOptional
    .filter((ref) => !docs.byRole[ref.role])
    .map((ref) => ref.role);

  const coverage = buildCoverageInfo({
    matched: assembled.concerns.matched,
    skipped: assembled.concerns.skipped,
    excludedConcernIds,
    documentsLoaded,
    documentsMissing,
  });

  const findingErrors = findings.filter((f) => f.severity === "error").length;
  const contradictionErrors = contradictions.filter(
    (c) => c.severity === "error",
  ).length;
  const errors = findingErrors + contradictionErrors;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const notes = findings.filter((f) => f.severity === "note").length;
  const humanReview = findings.filter((f) => f.requiresHumanReview).length;

  return {
    version: "2.0",
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
    toleranceApplied: tolerance,
    exclusionsApplied: exclusions,
    coverage,
  };
}
