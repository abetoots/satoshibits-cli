// primary public API
export { assemble, lint } from "./core/evaluator.js";
export type { AssembleInput, LintInput } from "./core/evaluator.js";

export type { EvaluationEngine, EvaluationResult } from "./core/engine/index.js";
export { SdkEngine } from "./core/engine/index.js";

// primary types
export type {
  DocLintManifest,
  DocumentRef,
  ConcernSchema,
  InteractionSchema,
  ConcernOrInteraction,
  LoadedConcern,
  AssembledPrompt,
  DocumentReference,
  AssembleResult,
  LintResult,
  Finding,
  ContradictionFinding,
  Severity,
  Confidence,
} from "./types/index.js";
