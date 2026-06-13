import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

import {
  extractJson,
  parseEvaluationResponse,
  parseContradictionResponse,
  parseDriftResponse,
} from "../../src/core/response-parser.js";

const FIXTURES = path.join(import.meta.dirname, "../fixtures");

describe("response-parser", () => {
  describe("extractJson", () => {
    it("extracts from ```json fences", () => {
      const text = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
      const result = extractJson(text);
      expect(result).toEqual({ key: "value" });
    });

    it("extracts from bare ``` fences", () => {
      const text = 'Before\n```\n{"key": 42}\n```\nAfter';
      const result = extractJson(text);
      expect(result).toEqual({ key: 42 });
    });

    it("extracts from first brace match", () => {
      const text = 'The result is {"status": "ok"} and that is all.';
      const result = extractJson(text);
      expect(result).toEqual({ status: "ok" });
    });

    it("returns null for non-JSON text", () => {
      const text = "No JSON here at all.";
      const result = extractJson(text);
      expect(result).toBeNull();
    });

    it("handles nested objects", () => {
      const text = '```json\n{"a": {"b": {"c": 1}}}\n```';
      const result = extractJson(text);
      expect(result).toEqual({ a: { b: { c: 1 } } });
    });
  });

  describe("parseEvaluationResponse", () => {
    it("parses a real LLM response", () => {
      const text = fs.readFileSync(
        path.join(FIXTURES, "sample-llm-response.txt"),
        "utf8",
      );

      const { findings, parseError } = parseEvaluationResponse(
        text,
        "idempotency-boundaries",
      );

      expect(parseError).toBeUndefined();
      expect(findings).toHaveLength(2);
      expect(findings[0]!.id).toBe("gap-1");
      expect(findings[0]!.severity).toBe("error");
      expect(findings[0]!.concernId).toBe("idempotency-boundaries");
      expect(findings[1]!.severity).toBe("warn");
    });

    it("returns parse error for invalid text", () => {
      const { findings, parseError } = parseEvaluationResponse(
        "Not JSON at all",
        "test",
      );

      expect(findings).toHaveLength(0);
      expect(parseError).toContain("Failed to extract JSON");
    });

    it("normalizes severity values", () => {
      const text = `\`\`\`json
{
  "gaps": [
    { "severity": "warning", "description": "test" },
    { "severity": "unknown", "description": "test2" }
  ]
}
\`\`\``;

      const { findings } = parseEvaluationResponse(text, "test");
      expect(findings[0]!.severity).toBe("warn");
      expect(findings[1]!.severity).toBe("note");
    });
  });

  describe("parseContradictionResponse", () => {
    it("parses contradiction findings", () => {
      const text = `\`\`\`json
{
  "contradictions": [
    {
      "id": "c-1",
      "statement_a": { "text": "99.99% uptime", "location": "BRD Section 2" },
      "statement_b": { "text": "single region", "location": "ADD Section 3" },
      "conflict_type": "quantitative",
      "severity": "error",
      "explanation": "Single region cannot achieve 99.99%"
    }
  ]
}
\`\`\``;

      const { contradictions, parseError } = parseContradictionResponse(text);
      expect(parseError).toBeUndefined();
      expect(contradictions).toHaveLength(1);
      expect(contradictions[0]!.conflictType).toBe("quantitative");
      expect(contradictions[0]!.severity).toBe("error");
    });

    it("handles empty contradictions array", () => {
      const text = '```json\n{"contradictions": []}\n```';
      const { contradictions } = parseContradictionResponse(text);
      expect(contradictions).toHaveLength(0);
    });
  });

  describe("parseDriftResponse", () => {
    it("parses the three drift types", () => {
      const text = `\`\`\`json
{
  "drifts": [
    {
      "id": "drift-1",
      "drift_type": "value-mismatch",
      "doc_claim": { "text": "3 retries", "location": "ADD Section 4" },
      "code_reality": { "text": "maxRetries: 5", "location": "src/http.ts:12" },
      "severity": "error",
      "confidence": "high",
      "explanation": "docs say 3, code uses 5",
      "recommendation": "update ADD to 5"
    },
    {
      "id": "drift-2",
      "drift_type": "implemented-not-documented",
      "doc_claim": { "text": "", "location": "" },
      "code_reality": { "text": "POST /refund", "location": "src/routes.ts:9" },
      "severity": "warn",
      "confidence": "medium",
      "explanation": "route not in docs",
      "recommendation": "document it"
    },
    {
      "id": "drift-3",
      "drift_type": "documented-not-implemented",
      "doc_claim": { "text": "GET /legacy", "location": "FRD Section 2" },
      "code_reality": { "text": "(not found in scanned code)", "location": "(not found in scanned code)" },
      "severity": "note",
      "confidence": "low",
      "explanation": "endpoint not found",
      "recommendation": "remove from docs or implement",
      "requires_human_review": true
    }
  ]
}
\`\`\``;
      const { drifts, parseError } = parseDriftResponse(text);
      expect(parseError).toBeUndefined();
      expect(drifts).toHaveLength(3);
      expect(drifts.map((d) => d.driftType)).toEqual([
        "value-mismatch",
        "implemented-not-documented",
        "documented-not-implemented",
      ]);
      expect(drifts[0]!.severity).toBe("error");
      expect(drifts[0]!.codeReality.location).toBe("src/http.ts:12");
      expect(drifts[2]!.requiresHumanReview).toBe(true);
    });

    it("normalizes an unknown drift_type to value-mismatch", () => {
      const text = '```json\n{"drifts": [{"id": "d", "drift_type": "weird", "severity": "warn"}]}\n```';
      const { drifts } = parseDriftResponse(text);
      expect(drifts[0]!.driftType).toBe("value-mismatch");
      expect(drifts[0]!.severity).toBe("warn");
    });

    it("returns a parseError on malformed JSON", () => {
      const { drifts, parseError } = parseDriftResponse("not json at all");
      expect(drifts).toHaveLength(0);
      expect(parseError).toBeDefined();
    });

    it("handles an empty drifts array", () => {
      const { drifts } = parseDriftResponse('```json\n{"drifts": []}\n```');
      expect(drifts).toHaveLength(0);
    });
  });
});
