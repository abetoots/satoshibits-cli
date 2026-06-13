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

export type DocLintMode = "doc-first" | "code-first" | "reconcile";

export interface CodeConfig {
  paths?: string[]; // source roots to scan; defaults to ["."]
  ignore?: string[]; // extra ignore globs
  entrypoints?: string[]; // entrypoint hints
  maxInputTokens?: number; // soft cap for tier-2 summarization
}

export interface DocLintManifest {
  version: string;
  // operating mode; defaults to "doc-first" when absent (back-compat)
  mode?: DocLintMode;
  project: {
    name: string;
    description?: string;
    classification?: ProjectClassification;
  };
  // documents are optional in code-first mode (scaffold them with `doc-lint bootstrap`)
  documents?: {
    required?: DocumentRef[];
    optional?: DocumentRef[];
    contracts?: DocumentRef[];
    operational?: DocumentRef[];
    reference?: DocumentRef[];
  };
  code?: CodeConfig;
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
