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

// EvaluationContext carries EXECUTION authority (repo-read access) alongside the
// prompt, so an engine can read real source on demand.
//
// Design intent: AssembledPrompt is the INTENT (concern + schema) and this is the
// execution authority. v1 caveat: `lint()` still assembles the prompt in inline
// mode (doc content embedded, plus the reconcile code map), so the agentic engine
// currently receives that inline evidence as a STARTING point in `prompt.user`
// even though it also reads source via this context. Moving the agent path to pure
// reference-mode (paths only, no code map) is a tracked follow-up.
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
