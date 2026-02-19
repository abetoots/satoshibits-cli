export interface ConcernSchema {
  concern: {
    id: string;
    version: string;
    name: string;
    category: string;
    severity: string;
    description: string;
  };
  triggers: {
    any_of: string[];
    escalate_if?: string[];
  };
  evaluation: {
    question: string;
    checklist?: ChecklistItem[];
    evidence_required: EvidenceField[];
    failure_condition: string;
    recommendation_template?: string;
  };
  examples?: Record<string, unknown>;
  metadata?: ConcernMetadata;
}

export interface InteractionSchema {
  interaction: {
    id: string;
    version: string;
    name: string;
    category: string;
    severity: string;
    description: string;
  };
  triggers: {
    all_of: string[];
    alternative_triggers?: AlternativeTrigger[];
  };
  failure_modes: FailureMode[];
  evaluation: {
    preamble: string;
    combined_question: string;
    output_format: string;
    failure_condition: string;
  };
  recommendations?: Record<string, string>;
  metadata?: ConcernMetadata;
}

export interface AlternativeTrigger {
  all_of: string[];
}

export interface ChecklistItem {
  id: string;
  question: string;
}

export interface EvidenceField {
  field: string;
  type: string;
  description?: string;
  required?: boolean;
  values?: (string | null)[];
  examples?: string[];
}

export interface FailureMode {
  id: string;
  name: string;
  severity: string;
  description: string;
  question: string;
  evidence_required: EvidenceField[];
  failure_examples: string[];
}

export interface ConcernMetadata {
  created: string;
  last_updated: string;
  author: string;
  related_concerns?: string[];
  recommended_after?: string[];
  tier?: number;
  references?: string[];
}

export type ConcernOrInteraction = ConcernSchema | InteractionSchema;

export function isConcernSchema(schema: ConcernOrInteraction): schema is ConcernSchema {
  return "concern" in schema;
}

export function isInteractionSchema(schema: ConcernOrInteraction): schema is InteractionSchema {
  return "interaction" in schema;
}

export interface LoadedConcern {
  schema: ConcernOrInteraction;
  filePath: string;
  id: string;
  version: string;
  name: string;
  type: "concern" | "interaction";
  category: string;
  severity: string;
  triggerSignals: string[];
  tier?: number;
}
