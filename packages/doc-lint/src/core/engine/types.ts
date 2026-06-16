import type { AssembledPrompt } from "../../types/index.js";

export type EvaluationResult =
  | {
      ok: true;
      content: string;
      usage?: { inputTokens: number; outputTokens: number };
      // present only for agentic engines — proof-of-work that keeps "absence" honest
      coverage?: EvaluationCoverage;
    }
  | { ok: false; error: string; coverage?: EvaluationCoverage };

export interface EvaluationEngine {
  // `context` is execution authority (repo access, sandbox) — optional so the
  // toolless SdkEngine satisfies the interface unchanged. Agentic engines read it.
  evaluate(prompt: AssembledPrompt, context?: EvaluationContext): Promise<EvaluationResult>;
}

// AssembledPrompt stays a pure INTENT artifact (concern + schema). Repo-read
// authority is EXECUTION and lives here, passed alongside the prompt.
export interface EvaluationContext {
  projectRoot: string; // absolute repo root
  sources: EvaluationSource[]; // the "lens": which roots, docs vs code
  sandbox: EvaluationSandbox; // read-only, repo-scoped, no exec/network
  completeness?: CompletenessPolicy; // discipline the engine must honor
}

export interface EvaluationSource {
  kind: "docs" | "code";
  path: string; // relative to projectRoot (a dir or file)
  role?: string; // brd/frd/add/... for docs
  required?: boolean; // absence here can't be a silent pass
}

export interface EvaluationSandbox {
  mode: "read-only";
  allowExecution: false;
  allowNetwork: false;
  allowedReadRoots: string[]; // absolute; reads outside → tool returns a permission error
  ignore?: string[]; // extra ignore globs (on top of built-in node_modules/.git/etc)
  maxFileBytes?: number; // cap per-file read size
}

export interface CompletenessPolicy {
  requireEnumeration: boolean; // must list/search candidate files before concluding
  requireAdversarialVerify: boolean; // a second pass that tries to refute a "pass"
  minSourcesRead?: "all" | number; // for absence-based concerns
}

export interface EvaluationCoverage {
  filesRead: string[];
  searchesPerformed: string[];
  toolTurnCount: number;
  unreadable?: { path: string; reason: string }[];
  // the engine's honest self-report; orchestration downgrades non-"complete" runs
  completeness: "complete" | "partial" | "insufficient";
}
