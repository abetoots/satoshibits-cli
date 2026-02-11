import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

import {
  extractJson,
  parseEvaluationResponse,
  parseContradictionResponse,
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
});
