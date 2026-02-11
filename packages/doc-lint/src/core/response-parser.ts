import type { ContradictionFinding, Finding, Severity, Confidence } from "../types/index.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function extractJson(text: string): unknown {
  // try ```json ... ``` fences first
  const jsonFenceMatch = /```json\s*\n?([\s\S]*?)\n?\s*```/.exec(text);
  if (jsonFenceMatch?.[1]) {
    try {
      return JSON.parse(jsonFenceMatch[1]);
    } catch {
      // fall through
    }
  }

  // try bare ``` ... ``` fences
  const bareFenceMatch = /```\s*\n?([\s\S]*?)\n?\s*```/.exec(text);
  if (bareFenceMatch?.[1]) {
    try {
      return JSON.parse(bareFenceMatch[1]);
    } catch {
      // fall through
    }
  }

  // try first { ... } brace match
  const braceStart = text.indexOf("{");
  if (braceStart !== -1) {
    let depth = 0;
    for (let i = braceStart; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(braceStart, i + 1));
        } catch {
          break;
        }
      }
    }
  }

  return null;
}

export function parseEvaluationResponse(
  text: string,
  concernId: string,
): { findings: Finding[]; parseError?: string } {
  const json = extractJson(text);
  if (!isRecord(json)) {
    return {
      findings: [],
      parseError: `Failed to extract JSON from response for concern ${concernId}`,
    };
  }

  const findings: Finding[] = [];

  if (isUnknownArray(json.gaps)) {
    for (let i = 0; i < json.gaps.length; i++) {
      const gap = json.gaps[i];
      if (!isRecord(gap)) continue;

      findings.push({
        id: typeof gap.id === "string" ? gap.id : `${concernId}-gap-${i + 1}`,
        concernId,
        relatedItem: typeof gap.related_item === "string" ? gap.related_item : "unknown",
        severity: normalizeSeverity(typeof gap.severity === "string" ? gap.severity : undefined),
        confidence: normalizeConfidence(typeof gap.confidence === "string" ? gap.confidence : undefined),
        description: typeof gap.description === "string" ? gap.description : "No description provided",
        sourceSearched: typeof gap.source_searched === "string" ? gap.source_searched : "Not specified",
        failureConditionTriggered: typeof gap.failure_condition_triggered === "string" ? gap.failure_condition_triggered : "Not specified",
        risk: typeof gap.risk === "string" ? gap.risk : "Not specified",
        recommendation: typeof gap.recommendation === "string" ? gap.recommendation : "Not specified",
        requiresHumanReview: typeof gap.requires_human_review === "boolean" ? gap.requires_human_review : false,
      });
    }
  }

  return { findings };
}

export function parseContradictionResponse(
  text: string,
): { contradictions: ContradictionFinding[]; parseError?: string } {
  const json = extractJson(text);
  if (!isRecord(json)) {
    return {
      contradictions: [],
      parseError: "Failed to extract JSON from contradiction response",
    };
  }

  const contradictions: ContradictionFinding[] = [];

  if (isUnknownArray(json.contradictions)) {
    for (let i = 0; i < json.contradictions.length; i++) {
      const c = json.contradictions[i];
      if (!isRecord(c)) continue;

      const stmtA = isRecord(c.statement_a) ? c.statement_a : {};
      const stmtB = isRecord(c.statement_b) ? c.statement_b : {};

      contradictions.push({
        id: typeof c.id === "string" ? c.id : `contradiction-${i + 1}`,
        statementA: {
          text: typeof stmtA.text === "string" ? stmtA.text : "Not specified",
          location: typeof stmtA.location === "string" ? stmtA.location : "Not specified",
        },
        statementB: {
          text: typeof stmtB.text === "string" ? stmtB.text : "Not specified",
          location: typeof stmtB.location === "string" ? stmtB.location : "Not specified",
        },
        conflictType: normalizeConflictType(typeof c.conflict_type === "string" ? c.conflict_type : undefined),
        severity: normalizeSeverity(typeof c.severity === "string" ? c.severity : undefined),
        explanation: typeof c.explanation === "string" ? c.explanation : "No explanation provided",
      });
    }
  }

  return { contradictions };
}

function normalizeSeverity(value?: string): Severity {
  if (value === "error" || value === "warn" || value === "note") return value;
  if (value === "warning") return "warn";
  return "note";
}

function normalizeConfidence(value?: string): Confidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function normalizeConflictType(
  value?: string,
): "quantitative" | "temporal" | "behavioral" | "scope" {
  if (
    value === "quantitative" ||
    value === "temporal" ||
    value === "behavioral" ||
    value === "scope"
  ) {
    return value;
  }
  return "behavioral";
}
