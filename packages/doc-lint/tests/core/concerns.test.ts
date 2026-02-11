import { describe, it, expect } from "vitest";

import { loadAllConcerns } from "../../src/core/concerns.js";
import { getConcernsDir } from "../../src/core/paths.js";

describe("concerns", () => {
  it("returns the concerns directory path", () => {
    const dir = getConcernsDir();
    expect(dir).toContain("concerns");
  });

  it("loads all bundled concerns", () => {
    const concerns = loadAllConcerns();

    // should find 6 core + 3 interactions = 9 total
    expect(concerns.length).toBe(9);

    const coreCount = concerns.filter((c) => c.type === "concern").length;
    const interactionCount = concerns.filter((c) => c.type === "interaction").length;

    expect(coreCount).toBe(6);
    expect(interactionCount).toBe(3);
  });

  it("loads concern metadata correctly", () => {
    const concerns = loadAllConcerns();
    const idempotency = concerns.find((c) => c.id === "idempotency-boundaries");

    expect(idempotency).toBeDefined();
    expect(idempotency!.version).toBe("1.0");
    expect(idempotency!.name).toBe("Idempotency at Trust Boundaries");
    expect(idempotency!.type).toBe("concern");
    expect(idempotency!.severity).toBe("error");
    expect(idempotency!.triggerSignals).toContain("external-api");
  });

  it("loads interaction metadata correctly", () => {
    const concerns = loadAllConcerns();
    const asyncApproval = concerns.find((c) => c.id === "async-times-approval");

    expect(asyncApproval).toBeDefined();
    expect(asyncApproval!.type).toBe("interaction");
    expect(asyncApproval!.triggerSignals).toContain("async-workflows");
    expect(asyncApproval!.triggerSignals).toContain("approval-gates");
  });
});
