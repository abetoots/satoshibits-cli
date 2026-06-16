import * as path from "node:path";

import type {
  AssembledPrompt,
  AssembleResult,
  CodeMap,
  ContradictionFinding,
  CoverageInfo,
  DocLintMode,
  DriftFinding,
  ExclusionEntry,
  Finding,
  Lens,
  LintResult,
  SignalAnalysis,
  ToleranceConfig,
} from "../types/index.js";
import type {
  EvaluationContext,
  EvaluationEngine,
  EvaluationSource,
} from "./engine/types.js";

import { loadAllConcerns } from "./concerns.js";
import { loadDocuments } from "./documents.js";
import { loadManifest } from "./manifest.js";
import {
  buildContradictionPrompt,
  buildDriftPrompt,
  buildEvaluationPrompt,
} from "./prompt-builder.js";
import {
  parseContradictionResponse,
  parseDriftResponse,
  parseEvaluationResponse,
} from "./response-parser.js";
import { detectSignals, resolveDocumentPaths } from "./signal-keywords.js";
import { matchConcerns } from "./signals.js";
import { buildCodeMap } from "./code-scan.js";

// concerns that reconcile docs against the code map — ONLY these receive the code map
// in their prompt. They either compare docs↔code (parity) or use code facts as the
// ground-truth inventory of what MUST be documented (routes, models, env vars, jobs).
// Both are safe: code facts here surface MORE gaps, they don't let an implementation
// fact mask a doc-gap concern (the false-pass risk we avoid for ordinary doc concerns).
const CODE_AWARE_CONCERNS = new Set([
  "endpoint-parity",
  "dependency-drift",
  "schema-doc-parity",
  "config-surface-documentation",
  "data-model-ownership",
  "background-job-observability",
  "public-contract-versioning",
  // reserved for planned code-vs-doc concerns (no-ops until those concern ids exist)
  "resilience-value-drift",
  "auth-enforcement-parity",
]);

export interface AssembleInput {
  projectPath: string;
  configPath?: string;
  contradiction?: boolean;
  drift?: boolean;
  filterConcernIds?: string[];
  tierFilter?: number | "all";
  tierCumulative?: boolean; // default: false (exact match). true = include all tiers up to tierFilter.
  autoDetect?: boolean; // CLI override for manifest.signals.auto_detect
  warnOnMismatch?: boolean; // CLI override for manifest.signals.warn_on_mismatch
  inline?: boolean; // default: true. Set to false for path references.
  // overrides for manifest fields (CLI flags); fall back to manifest when unset
  mode?: DocLintMode;
  codePaths?: string[];
  // evidence lens reframing the concern question. default "docs" (back-compat,
  // byte-identical prompts). "code"/"reconcile" point the question at source.
  lens?: Lens;
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

// drift findings have a different shape than concern findings, so they get their
// own suppression: severity-threshold tolerance plus location-based exclusions
// keyed on the code-reality location (file path) rather than relatedItem.
export function applyDriftFilters(
  drifts: DriftFinding[],
  tolerance: ToleranceConfig | undefined,
  exclusions: ExclusionEntry[] | undefined,
): DriftFinding[] {
  let kept = drifts;

  if (tolerance?.severity_threshold) {
    const minRank = SEVERITY_RANK[tolerance.severity_threshold] ?? 1;
    kept = kept.filter((d) => (SEVERITY_RANK[d.severity] ?? 0) >= minRank);
  }

  // exclusions are matched against the CODE side only (component == a path/dir);
  // doc-claim locations are doc labels (e.g. "ADD:4"), not components. match on a
  // path boundary so excluding "src/auth" does not also suppress "src/auth-utils.ts".
  const excludedComponents = (exclusions ?? []).flatMap((e) => (e.component ? [e.component] : []));
  if (excludedComponents.length > 0) {
    kept = kept.filter(
      (d) => !excludedComponents.some((comp) => locationMatchesComponent(d.codeReality.location, comp)),
    );
  }

  return kept;
}

// true when a code-reality location (e.g. "src/http.ts:12") is within an excluded
// component path. requires a boundary ("/" or ":") so prefixes don't over-match.
function locationMatchesComponent(location: string, component: string): boolean {
  if (location === component) return true;
  if (!location.startsWith(component)) return false;
  const next = location.charAt(component.length);
  return next === "/" || next === ":";
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
    // never filter the cross-cutting scanners
    if (
      prompt.type === "contradiction" ||
      prompt.type === "drift" ||
      !excludedIds.has(prompt.concernId)
    ) {
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

// assemble stays free/no-LLM. it may build a CodeMap (cheap static scan) for
// reconcile mode — that is a static scan, not an LLM call, so purity is preserved.
export async function assemble(input: AssembleInput): Promise<AssembleResult> {
  const manifest = loadManifest(input.projectPath, input.configPath);

  const mode: DocLintMode = input.mode ?? manifest.mode ?? "doc-first";

  // code-first has no authored docs to assemble prompts against — building concern
  // prompts over an empty doc set is the misleading path the reframe removed. redirect.
  if (mode === "code-first") {
    throw new Error(
      "Code-first projects have no authored docs to assemble. Run `doc-lint bootstrap` " +
        "to scaffold as-built docs + a gap inventory, then assemble/lint in doc-first or reconcile mode.",
    );
  }

  const docs = loadDocuments(manifest, input.projectPath);
  const allConcerns = loadAllConcerns();

  // build the code map when the mode reconciles docs against source (reconcile).
  // this is a static scan, not an LLM call, so assemble stays free/no-LLM.
  let codeMap: CodeMap | undefined;
  if (mode === "reconcile") {
    codeMap = await buildCodeMap(input.projectPath, {
      paths: input.codePaths ?? manifest.code?.paths,
      ignore: manifest.code?.ignore,
      entrypoints: manifest.code?.entrypoints,
      maxInputTokens: manifest.code?.maxInputTokens,
    });
  }

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
  let { matched, skipped } = matchConcerns(
    effectiveSignals,
    allConcerns,
    filterIds,
  );

  // apply tier filter: exact by default (--tier 2 = tier === 2), cumulative with --tier-cumulative
  const tierFilter = input.tierFilter;
  if (tierFilter !== undefined && tierFilter !== "all") {
    const cumulative = input.tierCumulative === true;
    const tierSkipped = matched.filter(
      (c) => c.tier == null || (cumulative ? c.tier > tierFilter : c.tier !== tierFilter),
    );
    matched = matched.filter(
      (c) => c.tier != null && (cumulative ? c.tier <= tierFilter : c.tier === tierFilter),
    );
    skipped = [...skipped, ...tierSkipped];
  }

  const inline = input.inline !== false;
  // lens defaults to "docs" (back-compat). The agentic code-audit path opts into
  // "code"/"reconcile" explicitly; we do NOT auto-derive from mode, so the SdkEngine
  // path stays byte-identical for existing modes.
  const lens: Lens = input.lens ?? "docs";
  // in reference mode, a code/reconcile evaluation needs the agent pointed at the
  // real source roots (it reads them itself). Omit for the doc-only docs lens.
  const codeRoots =
    !inline && (lens !== "docs" || mode === "reconcile")
      ? (input.codePaths ?? manifest.code?.paths ?? ["."])
      : undefined;
  const prompts: AssembledPrompt[] = [];

  for (const concern of matched) {
    // only code-aware concerns (parity + code-as-checklist) receive the code map;
    // injecting code facts into every concern would let implementation stand in for
    // documentation and falsely pass an ordinary doc-gap concern.
    const concernCodeMap = CODE_AWARE_CONCERNS.has(concern.id) ? codeMap : undefined;
    const prompt = buildEvaluationPrompt(concern, docs.all, inline, concernCodeMap, lens, codeRoots);
    prompts.push(prompt);
  }

  // contradiction scanner runs on all docs unless disabled
  const enableContradiction = input.contradiction !== false;
  if (enableContradiction) {
    const contradictionPrompt = buildContradictionPrompt(docs.all, inline);
    prompts.push(contradictionPrompt);
  }

  // drift scanner runs in reconcile mode (authored docs + code present) unless disabled
  const enableDrift = input.drift !== false;
  if (mode === "reconcile" && enableDrift && codeMap) {
    prompts.push(buildDriftPrompt(docs.all, codeMap));
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

  const result: AssembleResult = {
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

  if (!inline) {
    result.projectRoot = path.resolve(input.projectPath);
  }

  return result;
}

// build the execution authority an agentic engine reads source through. The
// sandbox boundary is the repo root (read-only); `sources` are advisory hints
// about where the relevant docs/code live. SdkEngine ignores all of this.
function buildEvaluationContext(input: {
  projectRoot: string;
  docs: { path: string; role: string; required: boolean }[];
  codePaths: string[];
  ignore?: string[];
}): EvaluationContext {
  const { projectRoot } = input;
  const rel = (p: string): string => (path.isAbsolute(p) ? path.relative(projectRoot, p) : p);

  const sources: EvaluationSource[] = [
    // carry role + required so the agent prompt can flag which docs MUST be read
    // (absence there can't be a silent pass)
    ...input.docs.map((d): EvaluationSource => ({
      kind: "docs",
      path: rel(d.path),
      role: d.role,
      required: d.required,
    })),
    ...input.codePaths.map((p): EvaluationSource => ({ kind: "code", path: rel(p) })),
  ];

  return {
    projectRoot,
    sources,
    sandbox: {
      mode: "read-only",
      allowExecution: false,
      allowNetwork: false,
      allowedReadRoots: [projectRoot],
      ignore: input.ignore,
    },
    completeness: {
      requireEnumeration: true,
      requireAdversarialVerify: false,
      // the default guarantee is the per-source `required` gate (a required source
      // the agent never read → completeness=partial). We deliberately do NOT opt
      // into the stricter minSourcesRead:"all" rule here (the engine enforces it
      // when set, but a blanket "every source read" would over-flag legitimate
      // grep-zero-match absence). Callers can still opt in via CompletenessPolicy.
    },
  };
}

// incomplete exploration means every conclusion from that run is advisory: a
// "no gap"/"absent" verdict the agent never fully searched for is exactly the
// false-pass the regex coverage section used to guard. Flag for human review.
function downgradeForCoverage<T extends { requiresHumanReview?: boolean }>(
  items: T[],
  completeness: "complete" | "partial" | "insufficient" | undefined,
): boolean {
  if (!completeness || completeness === "complete") return false;
  for (const item of items) item.requiresHumanReview = true;
  return items.length > 0;
}

// lint composes assemble — the two-layer architecture is enforced structurally
export async function lint(input: LintInput): Promise<LintResult> {
  const manifest = loadManifest(input.projectPath, input.configPath);
  // noop when no progress callback provided
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op fallback
  const progress = input.onProgress ?? ((_msg: string) => {});

  const mode: DocLintMode = input.mode ?? manifest.mode ?? "doc-first";

  // code-first is an ONBOARDING mode, not a lint-equivalent: it has no authored docs
  // to lint. (Linting docs derived from code would be circular — "is X documented?"
  // collapses into "is X implemented?".) Direct the user to `bootstrap`.
  if (mode === "code-first") {
    throw new Error(
      "Code-first projects have no authored docs to lint. Run `doc-lint bootstrap` to " +
        "scaffold as-built docs and a documentation gap inventory, fill in the intent " +
        "(TODOs), then lint in doc-first or reconcile mode.",
    );
  }

  const docs = loadDocuments(manifest, input.projectPath);
  // lint always assembles inline so the toolless SdkEngine has its evidence.
  // v1 caveat: the agentic engine also receives this inline content as a starting
  // point (it still reads real source via EvaluationContext); a pure reference-mode
  // agent path is a tracked follow-up. See EvaluationContext docs.
  const assembled = await assemble({ ...input, inline: true });

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

  // execution authority for agentic engines (read real source). SdkEngine ignores it.
  const requiredRoles = new Set((manifest.documents?.required ?? []).map((d) => d.role));
  const context = buildEvaluationContext({
    projectRoot: path.resolve(input.projectPath),
    docs: docs.all.map((d) => ({ path: d.path, role: d.role, required: requiredRoles.has(d.role) })),
    codePaths: input.codePaths ?? manifest.code?.paths ?? [],
    ignore: manifest.code?.ignore,
  });

  let findings: Finding[] = [];
  const contradictions: ContradictionFinding[] = [];
  let drifts: DriftFinding[] = [];

  // an incomplete run can't be trusted to have found everything — track it so a
  // zero-finding "partial"/"insufficient" run is surfaced, never a silent green.
  let incompleteEvaluations = 0;
  const noteIncomplete = (completeness: string | undefined): void => {
    if (completeness && completeness !== "complete") incompleteEvaluations++;
  };

  for (const prompt of activePrompts) {
    if (prompt.type === "contradiction") {
      progress("Running contradiction scanner...");
      const result = await input.engine.evaluate(prompt, context);
      // count incompleteness even on a failed run (turn-limit / no-key carry
      // insufficient coverage) so an all-aborted run can't read as a clean pass
      noteIncomplete(result.coverage?.completeness);

      if (result.ok) {
        const parsed = parseContradictionResponse(result.content);
        if (parsed.parseError) {
          progress(`  Warning: ${parsed.parseError}`);
        }
        contradictions.push(...parsed.contradictions);
      } else {
        progress(`  Error: ${result.error}`);
      }
    } else if (prompt.type === "drift") {
      progress("Running documentation–code drift scanner...");
      const result = await input.engine.evaluate(prompt, context);
      noteIncomplete(result.coverage?.completeness);

      if (result.ok) {
        const parsed = parseDriftResponse(result.content);
        if (parsed.parseError) {
          progress(`  Warning: ${parsed.parseError}`);
        }
        if (downgradeForCoverage(parsed.drifts, result.coverage?.completeness)) {
          progress(
            `  Note: exploration was ${result.coverage?.completeness} — drift findings flagged for human review`,
          );
        }
        drifts.push(...parsed.drifts);
      } else {
        progress(`  Error: ${result.error}`);
      }
    } else {
      progress(`Evaluating: ${prompt.concernName} (${prompt.concernId})`);
      const result = await input.engine.evaluate(prompt, context);
      noteIncomplete(result.coverage?.completeness);

      if (result.ok) {
        const parsed = parseEvaluationResponse(
          result.content,
          prompt.concernId,
        );
        if (parsed.parseError) {
          progress(`  Warning: ${parsed.parseError}`);
        }
        if (downgradeForCoverage(parsed.findings, result.coverage?.completeness)) {
          progress(
            `  Note: exploration was ${result.coverage?.completeness} — findings flagged for human review`,
          );
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

  // apply drift-specific suppression (own keys, not relatedItem)
  drifts = applyDriftFilters(drifts, tolerance, exclusions);

  // build coverage info
  const documentsLoaded = docs.all.map((d) => d.role);
  const allDeclaredOptional = [
    ...(manifest.documents?.optional ?? []),
    ...(manifest.documents?.contracts ?? []),
    ...(manifest.documents?.operational ?? []),
    ...(manifest.documents?.reference ?? []),
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
  const driftErrors = drifts.filter((d) => d.severity === "error").length;
  const errors = findingErrors + contradictionErrors + driftErrors;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const notes = findings.filter((f) => f.severity === "note").length;
  const humanReview =
    findings.filter((f) => f.requiresHumanReview).length +
    drifts.filter((d) => d.requiresHumanReview).length;

  // an incomplete run with zero flagged findings would otherwise read as a clean
  // pass — warn so "we didn't find anything" can't masquerade as "there's nothing".
  if (incompleteEvaluations > 0) {
    progress(
      `Warning: ${incompleteEvaluations} evaluation(s) did not fully explore the sources — ` +
        `treat passing results as inconclusive, not confirmed.`,
    );
  }

  return {
    version: "2.0",
    timestamp: new Date().toISOString(),
    project: assembled.project,
    signals: assembled.signals,
    concerns: assembled.concerns,
    findings,
    contradictions,
    drifts,
    summary: {
      totalFindings: findings.length,
      errors,
      warnings,
      notes,
      contradictions: contradictions.length,
      drifts: drifts.length,
      humanReviewRequired: humanReview,
      ...(incompleteEvaluations > 0 ? { incompleteEvaluations } : {}),
    },
    toleranceApplied: tolerance,
    exclusionsApplied: exclusions,
    coverage,
  };
}
