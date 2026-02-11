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

export interface LintResult {
  version: string;
  timestamp: string;
  project: string;
  signals: string[];
  concerns: {
    matched: string[];
    skipped: string[];
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
}

export interface AssembleResult {
  version: string;
  timestamp: string;
  project: string;
  signals: string[];
  concerns: {
    matched: string[];
    skipped: string[];
  };
  prompts: AssembledPrompt[];
}
