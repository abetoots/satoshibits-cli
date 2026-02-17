export type {
  DocLintManifest,
  DocumentRef,
  ProjectClassification,
  ToleranceConfig,
  ExclusionEntry,
} from "./manifest.js";

export type {
  ConcernSchema,
  InteractionSchema,
  AlternativeTrigger,
  ChecklistItem,
  EvidenceField,
  FailureMode,
  ConcernMetadata,
  ConcernOrInteraction,
  LoadedConcern,
} from "./concerns.js";

export {
  isConcernSchema,
  isInteractionSchema,
} from "./concerns.js";

export type {
  AssembledPrompt,
  Severity,
  Confidence,
  Finding,
  ContradictionFinding,
  CoverageInfo,
  SignalAnalysis,
  LintResult,
  AssembleResult,
} from "./findings.js";

export type {
  AssembleOptions,
  InitOptions,
  LintOptions,
} from "./cli-options.js";
