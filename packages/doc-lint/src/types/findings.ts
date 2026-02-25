export interface DocumentReference {
  role: string;
  label: string;
  path: string;
}

export interface AssembledPrompt {
  concernId: string;
  concernVersion: string;
  concernName: string;
  type: "concern" | "interaction" | "contradiction";
  system: string;
  user: string;
  responseSchema: object;
  metadata: {
    documentsIncluded: string[];
    templateVersion: string;
  };
  documents?: DocumentReference[];
}

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
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    notes: number;
    contradictions: number;
    humanReviewRequired: number;
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
