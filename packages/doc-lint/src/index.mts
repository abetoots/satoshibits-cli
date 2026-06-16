// primary public API
export { assemble, lint } from "./core/evaluator.js";
export type { AssembleInput, LintInput } from "./core/evaluator.js";

// evaluation engines & the agentic execution contract
export type {
  EvaluationEngine,
  EvaluationResult,
  EvaluationContext,
  EvaluationSource,
  EvaluationSandbox,
  CompletenessPolicy,
  EvaluationCoverage,
} from "./core/engine/index.js";
export { SdkEngine, AnthropicAgentEngine } from "./core/engine/index.js";

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
  Lens,
  AssembleResult,
  LintResult,
  Finding,
  ContradictionFinding,
  DriftFinding,
  DriftType,
  Severity,
  Confidence,
} from "./types/index.js";

// code-first & drift support
export type {
  DocLintMode,
  CodeConfig,
  CodeMap,
  CodeScanOptions,
} from "./types/index.js";
