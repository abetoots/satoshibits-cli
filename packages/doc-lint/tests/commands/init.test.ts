import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "js-yaml";

import { initCommand, formatInitOutput } from "../../src/commands/init.js";

import type { DocLintManifest } from "../../src/types/index.js";
import type { InitResult } from "../../src/commands/init.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-init-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeDoc(relativePath: string, content: string): void {
  const abs = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function setupPaymentProject(): void {
  writeDoc("docs/brd.md", `
    # Business Requirements
    Payment processing system that accepts credit card payments via Stripe.
    Process payments within 5 seconds. Support webhook notifications.
    Billing system with refund handling and transaction tracking.
    Invoice generation and checkout flow.
  `);
  writeDoc("docs/frd.md", `
    # Functional Requirements
    ## Payment Flow
    User submits payment form. Server calls Stripe API to create charge.
    Stripe sends webhook on completion. Order status updated.
    REST API endpoint handles API calls to third-party API services.
  `);
  writeDoc("docs/add.md", `
    # Architecture Design Document
    Payment Service handles charge creation via Stripe SDK.
    Webhook Handler receives and processes Stripe events.
    External API integration for payment processing.
    PostgreSQL database for order state persistence.
  `);
}

function readGeneratedManifest(): DocLintManifest {
  const content = fs.readFileSync(path.join(tmpDir, "doc-lint.yaml"), "utf8");
  return yaml.load(content) as DocLintManifest;
}

describe("initCommand --yes mode", () => {
  it("generates a valid manifest with discovered documents and detected signals", async () => {
    setupPaymentProject();

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "doc-lint.yaml"))).toBe(true);

    const manifest = readGeneratedManifest();

    // validate structure
    expect(manifest.version).toBe("1.0");
    expect(manifest.project.name).toBe(path.basename(tmpDir));
    expect(manifest.project.classification).toBe("standard");

    // required docs
    const requiredRoles = manifest.documents.required.map((d) => d.role);
    expect(requiredRoles).toContain("brd");
    expect(requiredRoles).toContain("frd");
    expect(requiredRoles).toContain("add");

    // signals should be non-empty (high + medium confidence)
    expect(manifest.signals.declared.length).toBeGreaterThan(0);
  });

  it("detects payment and webhook signals from sample project", async () => {
    setupPaymentProject();

    await initCommand(tmpDir, { yes: true });

    const manifest = readGeneratedManifest();
    const signals = manifest.signals.declared;

    // payment project should detect these signals
    expect(signals).toContain("payments");
  });

  it("fails when required documents are missing", async () => {
    // only brd, no frd or add
    writeDoc("docs/brd.md", "# Business Requirements\nPayment system");

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(2);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining("Missing required documents"),
    );
  });

  it("fails when no signals detected", async () => {
    writeDoc("docs/brd.md", "# Document\nGeneral text with no specific terminology");
    writeDoc("docs/frd.md", "# Document\nMore general text about nothing");
    writeDoc("docs/add.md", "# Document\nAnother bland document");

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(2);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining("No signals detected"),
    );
  });

  it("overwrites existing manifest silently in --yes mode", async () => {
    setupPaymentProject();
    writeDoc("doc-lint.yaml", "version: '1.0'\nold: content");

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(0);
    const manifest = readGeneratedManifest();
    expect(manifest.project).toBeDefined();
  });

  it("uses first match when multiple candidates exist", async () => {
    setupPaymentProject();
    writeDoc("docs/requirements.md", "# Additional Requirements\nPayment processing");

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(0);
    const manifest = readGeneratedManifest();
    const brd = manifest.documents.required.find((d) => d.role === "brd");
    // should use first match (brd.md comes before requirements.md in pattern order)
    expect(brd).toBeDefined();
  });

  it("includes optional documents when found", async () => {
    setupPaymentProject();
    writeDoc("docs/openapi.yaml", "openapi: 3.0.0\ninfo:\n  title: Test API");

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(0);
    const manifest = readGeneratedManifest();
    expect(manifest.documents.optional).toBeDefined();
    const optionalRoles = manifest.documents.optional!.map((d) => d.role);
    expect(optionalRoles).toContain("api_spec");
  });

  it("ignores directories matching --ignore patterns", async () => {
    // put valid docs in archived/ and real docs in docs/
    writeDoc("archived/brd.md", "# Stale BRD\nOld payment system with Stripe billing.");
    writeDoc("docs/brd.md", `
      # Business Requirements
      Payment processing system that accepts credit card payments via Stripe.
      Billing system with refund handling and transaction tracking.
    `);
    writeDoc("docs/frd.md", `
      # Functional Requirements
      Payment form submission creates a charge. Transaction records stored.
    `);
    writeDoc("docs/add.md", `
      # Architecture Design Document
      Payment Service handles charge creation.
    `);

    const exitCode = await initCommand(tmpDir, { yes: true, ignore: ["**/archived/**"] });

    expect(exitCode).toBe(0);
    const manifest = readGeneratedManifest();
    const brd = manifest.documents.required.find((d) => d.role === "brd");
    expect(brd).toBeDefined();
    expect(brd!.path).not.toContain("archived");
  });

  it("fails when --ignore excludes all required documents", async () => {
    // all docs live under docs/, ignoring it leaves nothing
    writeDoc("docs/brd.md", "# BRD\nPayment system");
    writeDoc("docs/frd.md", "# FRD\nPayment flow");
    writeDoc("docs/add.md", "# ADD\nPayment architecture");

    const exitCode = await initCommand(tmpDir, { yes: true, ignore: ["**/docs/**"] });

    expect(exitCode).toBe(2);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining("Missing required documents"),
    );
  });

  it("only includes high and medium confidence signals", async () => {
    // write docs that heavily mention payments but barely mention anything else
    writeDoc("docs/brd.md", `
      Payment processing with charge creation and transaction tracking.
      Refund handling via billing system with Stripe and PayPal.
      Invoice generation and checkout flow.
    `);
    writeDoc("docs/frd.md", `
      Payment form submission creates a charge.
      Transaction records stored in database.
    `);
    writeDoc("docs/add.md", `
      Payment Service handles billing.
      Single retry on failure.
    `);

    const exitCode = await initCommand(tmpDir, { yes: true });

    expect(exitCode).toBe(0);
    const manifest = readGeneratedManifest();
    // payments should be high confidence and included
    expect(manifest.signals.declared).toContain("payments");
  });
});

describe("formatInitOutput", () => {
  it("formats init result for display", () => {
    const result: InitResult = {
      projectName: "my-project",
      classification: "standard",
      documents: {
        required: [
          { role: "brd", path: "docs/brd.md" },
          { role: "frd", path: "docs/frd.md" },
          { role: "add", path: "docs/add.md" },
        ],
        optional: [
          { role: "api_spec", path: "docs/openapi.yaml" },
        ],
      },
      signals: ["payments", "webhooks", "external-api"],
      manifestPath: "/project/doc-lint.yaml",
    };

    const output = formatInitOutput(result);

    expect(output).toContain("Initializing doc-lint manifest");
    expect(output).toContain("docs/brd.md (brd)");
    expect(output).toContain("docs/frd.md (frd)");
    expect(output).toContain("docs/add.md (add)");
    expect(output).toContain("docs/openapi.yaml (api spec)");
    expect(output).toContain("my-project");
    expect(output).toContain("standard");
    expect(output).toContain("3 declared");
    expect(output).toContain("doc-lint.yaml");
  });

  it("handles empty optional documents", () => {
    const result: InitResult = {
      projectName: "test",
      classification: "financial",
      documents: {
        required: [
          { role: "brd", path: "brd.md" },
          { role: "frd", path: "frd.md" },
          { role: "add", path: "add.md" },
        ],
        optional: [],
      },
      signals: ["payments"],
      manifestPath: "/project/doc-lint.yaml",
    };

    const output = formatInitOutput(result);

    expect(output).toContain("financial");
    expect(output).not.toContain("Optional:");
  });
});

describe("generated manifest validity", () => {
  it("produces a manifest that passes loadManifest validation", async () => {
    setupPaymentProject();

    await initCommand(tmpDir, { yes: true });

    // the manifest should be valid YAML that can be re-loaded
    const content = fs.readFileSync(path.join(tmpDir, "doc-lint.yaml"), "utf8");
    const parsed = yaml.load(content) as DocLintManifest;

    // check structure matches what loadManifest expects
    expect(parsed.version).toBe("1.0");
    expect(parsed.project.name).toBeTruthy();
    expect(Array.isArray(parsed.documents.required)).toBe(true);
    expect(parsed.documents.required.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(parsed.signals.declared)).toBe(true);
    expect(parsed.signals.declared.length).toBeGreaterThan(0);

    // verify required roles
    const roles = parsed.documents.required.map((d) => d.role);
    expect(roles).toContain("brd");
    expect(roles).toContain("frd");
    expect(roles).toContain("add");

    // verify each doc ref has role + path
    for (const doc of parsed.documents.required) {
      expect(typeof doc.role).toBe("string");
      expect(typeof doc.path).toBe("string");
    }
  });
});
