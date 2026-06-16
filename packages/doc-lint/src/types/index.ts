export type {
  DocLintManifest,
  DocLintMode,
  CodeConfig,
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
  DocumentReference,
  Lens,
  Severity,
  Confidence,
  Finding,
  ContradictionFinding,
  DriftFinding,
  DriftType,
  CoverageInfo,
  SignalAnalysis,
  MatchedConcernInfo,
  LintResult,
  AssembleResult,
} from "./findings.js";

export type {
  AssembleOptions,
  DetectOptions,
  InitOptions,
  LintOptions,
} from "./cli-options.js";

export type {
  CodeMap,
  CodeCoverage,
  CodeScanOptions,
  PackageInfo,
  RouteInfo,
  ModelInfo,
  ExternalCallInfo,
  ApiSurfaceItem,
} from "./code-map.js";
