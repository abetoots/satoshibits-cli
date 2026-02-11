import { describe, it, expect } from "vitest";

import { matchConcerns } from "../../src/core/signals.js";

import type { LoadedConcern, ConcernSchema, InteractionSchema } from "../../src/types/index.js";

function makeConcern(id: string, anyOf: string[]): LoadedConcern {
  return {
    schema: {
      concern: { id, version: "1.0", name: id, category: "core", severity: "error", description: "" },
      triggers: { any_of: anyOf },
      evaluation: { question: "", evidence_required: [], failure_condition: "" },
    } as ConcernSchema,
    filePath: `/fake/${id}.yaml`,
    id,
    version: "1.0",
    name: id,
    type: "concern",
    category: "core",
    severity: "error",
    triggerSignals: anyOf,
  };
}

function makeInteraction(id: string, allOf: string[], alternatives?: string[][]): LoadedConcern {
  return {
    schema: {
      interaction: { id, version: "1.0", name: id, category: "interaction", severity: "error", description: "" },
      triggers: {
        all_of: allOf,
        alternative_triggers: alternatives?.map((a) => ({ all_of: a })),
      },
      failure_modes: [],
      evaluation: { preamble: "", combined_question: "", output_format: "", failure_condition: "" },
    } as InteractionSchema,
    filePath: `/fake/${id}.yaml`,
    id,
    version: "1.0",
    name: id,
    type: "interaction",
    category: "interaction",
    severity: "error",
    triggerSignals: allOf,
  };
}

describe("signals", () => {
  describe("matchConcerns", () => {
    it("matches core concerns with any_of semantics", () => {
      const concerns = [
        makeConcern("c1", ["payments", "webhooks"]),
        makeConcern("c2", ["kubernetes", "docker"]),
      ];

      const result = matchConcerns(["payments"], concerns);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]!.id).toBe("c1");
      expect(result.skipped).toHaveLength(1);
    });

    it("matches interactions with all_of semantics", () => {
      const concerns = [
        makeInteraction("i1", ["async-workflows", "approval-gates"]),
      ];

      // only one signal - should not match
      const partial = matchConcerns(["async-workflows"], concerns);
      expect(partial.matched).toHaveLength(0);

      // both signals - should match
      const full = matchConcerns(["async-workflows", "approval-gates"], concerns);
      expect(full.matched).toHaveLength(1);
    });

    it("matches interactions via alternative triggers", () => {
      const concerns = [
        makeInteraction("i1", ["async-workflows", "approval-gates"], [
          ["message-queue", "authorization"],
        ]),
      ];

      const result = matchConcerns(["message-queue", "authorization"], concerns);
      expect(result.matched).toHaveLength(1);
    });

    it("filters by concern IDs when provided", () => {
      const concerns = [
        makeConcern("c1", ["payments"]),
        makeConcern("c2", ["payments"]),
      ];

      const result = matchConcerns(["payments"], concerns, ["c1"]);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0]!.id).toBe("c1");
    });

    it("returns empty matched when no signals match", () => {
      const concerns = [
        makeConcern("c1", ["payments"]),
      ];

      const result = matchConcerns(["unrelated-signal"], concerns);
      expect(result.matched).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
    });
  });
});
