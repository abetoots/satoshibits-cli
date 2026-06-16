export interface DocumentReference {
  role: string;
  label: string;
  path: string;
}

export interface AssembledPrompt {
  concernId: string;
  concernVersion: string;
  concernName: string;
  type: "concern" | "interaction" | "contradiction" | "drift";
  system: string;
  user: string;
  responseSchema: object;
  metadata: {
    documentsIncluded: string[];
    templateVersion: string;
  };
  // reference mode (`--no-inline`) only: the files/roots the consumer must read.
  documents?: DocumentReference[];
  // source roots an external agent should read (code/reconcile lens or reconcile mode)
  codeRoots?: string[];
}

// the evidence lens a concern is evaluated through. a concern is a system
// principle; the lens decides which question it asks of which source roots:
//   docs      → "is X documented?"            (doc gaps; today's default)
//   code      → "does the system satisfy X?"  (system risks, audited from source)
//   reconcile → "do docs and code agree on X?" (drift)
export type Lens = "docs" | "code" | "reconcile";

export type Severity = "error" | "warn" | "note";
export type Confidence = "high" | "medium" | "low";

export interface Finding {
  id: string;
  concernId: string;
  relatedItem: string;
  severity: Severity;
  confidence: Confidence;
  description: string;
  sourceSearched: string;
  failureConditionTriggered: string;
  risk: string;
  recommendation: string;
  requiresHumanReview: boolean;
}

export interface ContradictionFinding {
  id: string;
  statementA: {
    text: string;
    location: string;
  };
  statementB: {
    text: string;
    location: string;
  };
  conflictType: "quantitative" | "temporal" | "behavioral" | "scope";
  severity: Severity;
  explanation: string;
}

export type DriftType =
  | "documented-not-implemented"
  | "implemented-not-documented"
  | "value-mismatch";

export interface DriftFinding {
  id: string;
  driftType: DriftType;
  docClaim: { text: string; location: string };
  codeReality: { text: string; location: string }; // file:line, or "(not found in scanned code)"
  severity: Severity;
  confidence: Confidence;
  explanation: string;
  recommendation: string;
  // true when the evidence needed to confirm this could not be fully scanned
  // (completeness gate) — such findings should be treated as advisory, not failures
  requiresHumanReview?: boolean;
}

export interface CoverageInfo {
  concernsEvaluated: string[];
  concernsSkipped: string[];
  concernsExcluded: string[];
  documentsLoaded: string[];
  documentsMissing: string[];
}

export interface SignalAnalysis {
  declared: string[];
  detected: string[];       // empty when detection didn't run
  effective: string[];      // what was actually used for concern matching
  mismatch?: {
    undeclared: string[];   // detected in docs but not in declared
    stale: string[];        // declared but not detected in docs
  };
}

export interface MatchedConcernInfo {
  id: string;
  tier?: number;
  type: "concern" | "interaction";
}

export interface LintResult {
  version: string;
  timestamp: string;
  project: string;
  signals: SignalAnalysis;
  concerns: {
    matched: string[];
    skipped: string[];
    matchedDetails: MatchedConcernInfo[];
  };
  findings: Finding[];
  contradictions: ContradictionFinding[];
  drifts: DriftFinding[];
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    notes: number;
    contradictions: number;
    drifts: number;
    humanReviewRequired: number;
    // count of evaluations whose agentic exploration was not "complete"; when set,
    // passing results are inconclusive (the engine couldn't fully verify absence)
    incompleteEvaluations?: number;
  };
  toleranceApplied?: import("./manifest.js").ToleranceConfig;
  exclusionsApplied?: import("./manifest.js").ExclusionEntry[];
  coverage?: CoverageInfo;
}

export interface AssembleResult {
  version: string;
  timestamp: string;
  project: string;
  projectRoot?: string;
  signals: SignalAnalysis;
  concerns: {
    matched: string[];
    skipped: string[];
    matchedDetails: MatchedConcernInfo[];
  };
  prompts: AssembledPrompt[];
}
