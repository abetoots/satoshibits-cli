import type { Severity } from "./findings.js";

export type ProjectClassification = "standard" | "financial" | "healthcare" | "infrastructure";

export interface ToleranceConfig {
  severity_threshold?: Severity;
  allow_implicit?: boolean;
  allow_external_refs?: boolean;
}

export interface ExclusionEntry {
  component?: string;
  concernId?: string;
  reason: string;
  approved_by?: string;
}

export interface DocLintManifest {
  version: string;
  project: {
    name: string;
    description?: string;
    classification?: ProjectClassification;
  };
  documents: {
    required: DocumentRef[];
    optional?: DocumentRef[];
    contracts?: DocumentRef[];
    operational?: DocumentRef[];
    reference?: DocumentRef[];
  };
  signals: {
    declared: string[];
    auto_detect?: boolean;
    warn_on_mismatch?: boolean;
  };
  options?: {
    contradiction?: boolean;
    concerns?: string[];
  };
  tolerance?: ToleranceConfig;
  exclusions?: ExclusionEntry[];
}

export interface DocumentRef {
  role: string;
  path: string;
  label?: string;
}
