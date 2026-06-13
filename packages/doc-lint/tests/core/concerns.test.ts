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

    // merged union of both branches' concerns:
    // 13 core + 3 interactions + 3 promise-validation + 5 security
    // + 12 operational + 5 compliance + 3 test-coverage = 44 total
    expect(concerns.length).toBe(44);

    const coreCount = concerns.filter((c) => c.type === "concern").length;
    const interactionCount = concerns.filter((c) => c.type === "interaction").length;

    // all non-interaction concerns (type "concern") = 44 - 3 interactions = 41
    expect(coreCount).toBe(41);
    expect(interactionCount).toBe(3);
  });

  it("loads the new code-vs-doc (drift) concerns", () => {
    const concerns = loadAllConcerns();
    const endpoint = concerns.find((c) => c.id === "endpoint-parity");
    const dep = concerns.find((c) => c.id === "dependency-drift");
    const schema = concerns.find((c) => c.id === "schema-doc-parity");

    expect(endpoint?.type).toBe("concern");
    expect(endpoint?.triggerSignals).toContain("rest-api");
    expect(dep?.triggerSignals).toContain("external-dependency");
    expect(schema?.triggerSignals).toContain("database");
  });

  it("loads the new doc-vs-doc concerns", () => {
    const ids = loadAllConcerns().map((c) => c.id);
    expect(ids).toContain("config-surface-documentation");
    expect(ids).toContain("data-model-ownership");
    expect(ids).toContain("public-contract-versioning");
    expect(ids).toContain("background-job-observability");
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

  it("loads concerns from all subdirectories", () => {
    const concerns = loadAllConcerns();
    const categories = new Set(concerns.map((c) => c.category));

    expect(categories).toContain("core");
    expect(categories).toContain("interaction");
    expect(categories).toContain("promise-validation");
    expect(categories).toContain("security");
    expect(categories).toContain("operational");
    expect(categories).toContain("compliance");
    expect(categories).toContain("test-coverage");
  });

  it("loads a promise-validation concern correctly", () => {
    const concerns = loadAllConcerns();
    const sla = concerns.find((c) => c.id === "sla-architecture-alignment");

    expect(sla).toBeDefined();
    expect(sla!.type).toBe("concern");
    expect(sla!.category).toBe("promise-validation");
    expect(sla!.severity).toBe("error");
    expect(sla!.triggerSignals).toContain("sla");
  });

  it("loads a security concern correctly", () => {
    const concerns = loadAllConcerns();
    const threat = concerns.find((c) => c.id === "threat-model-coverage");

    expect(threat).toBeDefined();
    expect(threat!.type).toBe("concern");
    expect(threat!.category).toBe("security");
  });

  it("loads an operational concern correctly", () => {
    const concerns = loadAllConcerns();
    const failure = concerns.find((c) => c.id === "failure-mode-coverage");

    expect(failure).toBeDefined();
    expect(failure!.type).toBe("concern");
    expect(failure!.category).toBe("operational");
  });

  it("loads a compliance concern correctly", () => {
    const concerns = loadAllConcerns();
    const auth = concerns.find((c) => c.id === "auth-scheme-compliance");

    expect(auth).toBeDefined();
    expect(auth!.type).toBe("concern");
    expect(auth!.category).toBe("compliance");
  });

  it("loads a test-coverage concern correctly", () => {
    const concerns = loadAllConcerns();
    const reqTest = concerns.find((c) => c.id === "requirement-test-mapping");

    expect(reqTest).toBeDefined();
    expect(reqTest!.type).toBe("concern");
    expect(reqTest!.category).toBe("test-coverage");
  });
});
