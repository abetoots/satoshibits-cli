import { describe, it, expect } from "vitest";

import { formatList } from "../../src/commands/list.js";

import type { LoadedConcern, ConcernSchema, InteractionSchema } from "../../src/types/index.js";

function makeConcern(overrides: Partial<LoadedConcern> = {}): LoadedConcern {
  return {
    schema: {} as ConcernSchema,
    filePath: "/fake/path.yaml",
    id: "test-concern",
    version: "1.0",
    name: "Test Concern",
    type: "concern",
    category: "core",
    severity: "error",
    triggerSignals: ["external-api"],
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<LoadedConcern> = {}): LoadedConcern {
  return {
    schema: {} as InteractionSchema,
    filePath: "/fake/path.yaml",
    id: "test-interaction",
    version: "1.0",
    name: "Test Interaction",
    type: "interaction",
    category: "interactions",
    severity: "warn",
    triggerSignals: ["external-api", "payment"],
    ...overrides,
  };
}

describe("formatList", () => {
  it("groups concerns by category", () => {
    const concerns = [
      makeConcern({ id: "c1", name: "Concern One", category: "core" }),
      makeConcern({ id: "c2", name: "Concern Two", category: "security" }),
      makeConcern({ id: "c3", name: "Concern Three", category: "core" }),
    ];

    const output = formatList(concerns);

    // core should appear before security
    const coreIdx = output.indexOf("Core");
    const secIdx = output.indexOf("Security");
    expect(coreIdx).toBeLessThan(secIdx);

    // both concerns listed under core
    expect(output).toContain("c1");
    expect(output).toContain("c3");
    // security concern listed
    expect(output).toContain("c2");
  });

  it("interactions appear as a separate group", () => {
    const concerns = [
      makeConcern({ id: "c1", category: "core" }),
      makeInteraction({ id: "i1", name: "Webhook x Security" }),
    ];

    const output = formatList(concerns);

    expect(output).toContain("Interaction Matrices");
    expect(output).toContain("i1");

    // interactions should appear after core
    const coreIdx = output.indexOf("Core");
    const interIdx = output.indexOf("Interaction Matrices");
    expect(coreIdx).toBeLessThan(interIdx);
  });

  it("displays category count in header", () => {
    const concerns = [
      makeConcern({ id: "c1", category: "security" }),
      makeConcern({ id: "c2", category: "security" }),
      makeConcern({ id: "c3", category: "security" }),
    ];

    const output = formatList(concerns);
    expect(output).toMatch(/Security \(3\)/);
  });

  it("shows total concern count", () => {
    const concerns = [
      makeConcern({ id: "c1", category: "core" }),
      makeConcern({ id: "c2", category: "operational" }),
      makeInteraction({ id: "i1" }),
    ];

    const output = formatList(concerns);
    expect(output).toContain("Total: 3 concerns");
  });

  it("title-cases category names with hyphens replaced by spaces", () => {
    const concerns = [
      makeConcern({ id: "c1", category: "promise-validation" }),
      makeConcern({ id: "c2", category: "test-coverage" }),
    ];

    const output = formatList(concerns);
    expect(output).toContain("Promise Validation");
    expect(output).toContain("Test Coverage");
  });

  it("omits empty categories", () => {
    const concerns = [
      makeConcern({ id: "c1", category: "core" }),
    ];

    const output = formatList(concerns);
    expect(output).not.toContain("Security");
    expect(output).not.toContain("Operational");
  });

  it("shows trigger type: any_of for concerns, all_of for interactions", () => {
    const concerns = [
      makeConcern({ id: "c1", category: "core", triggerSignals: ["external-api"] }),
      makeInteraction({ id: "i1", triggerSignals: ["external-api", "payment"] }),
    ];

    const output = formatList(concerns);
    expect(output).toContain("Triggers (any_of):");
    expect(output).toContain("Triggers (all_of):");
  });
});
