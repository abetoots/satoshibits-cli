import * as path from "node:path";
import { describe, it, expect, vi } from "vitest";

import { assemble, lint } from "../../src/core/evaluator.js";

import type { EvaluationEngine } from "../../src/core/engine/types.js";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/signal-detect-project");
const NO_SIGNALS_FIXTURE_DIR = path.resolve(__dirname, "../fixtures/no-signals-project");
const MANIFEST_AUTODETECT_DIR = path.resolve(__dirname, "../fixtures/manifest-autodetect-project");

describe("signal analysis (auto_detect / warn_on_mismatch)", () => {
  describe("behavior matrix", () => {
    it("default (both false): detection does not run, effective equals declared", () => {
      const result = assemble({ projectPath: FIXTURE_DIR });

      expect(result.signals.declared).toEqual(["external-api", "payments", "webhooks"]);
      expect(result.signals.detected).toEqual([]);
      expect(result.signals.effective).toEqual(["external-api", "payments", "webhooks"]);
      expect(result.signals.mismatch).toBeUndefined();
    });

    it("auto_detect only: detection runs, effective is union of declared+detected, no mismatch", () => {
      const result = assemble({
        projectPath: FIXTURE_DIR,
        autoDetect: true,
      });

      expect(result.signals.declared).toEqual(["external-api", "payments", "webhooks"]);
      expect(result.signals.detected.length).toBeGreaterThan(0);
      // effective should contain all declared plus newly detected
      for (const s of result.signals.declared) {
        expect(result.signals.effective).toContain(s);
      }
      for (const s of result.signals.detected) {
        expect(result.signals.effective).toContain(s);
      }
      // no duplicates
      expect(result.signals.effective.length).toBe(new Set(result.signals.effective).size);
      // no mismatch reported when warnOnMismatch is false
      expect(result.signals.mismatch).toBeUndefined();
    });

    it("warn_on_mismatch only: detection runs for comparison, effective equals declared, mismatch reported", () => {
      const result = assemble({
        projectPath: FIXTURE_DIR,
        warnOnMismatch: true,
      });

      expect(result.signals.detected.length).toBeGreaterThan(0);
      // effective should NOT include detected (no merge)
      expect(result.signals.effective).toEqual(result.signals.declared);
      // mismatch should be reported
      expect(result.signals.mismatch).toBeDefined();
      expect(result.signals.mismatch!.undeclared.length).toBeGreaterThan(0);
      // undeclared signals are ones detected but not declared
      for (const s of result.signals.mismatch!.undeclared) {
        expect(result.signals.detected).toContain(s);
        expect(result.signals.declared).not.toContain(s);
      }
    });

    it("both true: detection runs, effective is union, mismatch reported", () => {
      const result = assemble({
        projectPath: FIXTURE_DIR,
        autoDetect: true,
        warnOnMismatch: true,
      });

      expect(result.signals.detected.length).toBeGreaterThan(0);
      // effective is union
      for (const s of result.signals.declared) {
        expect(result.signals.effective).toContain(s);
      }
      for (const s of result.signals.detected) {
        expect(result.signals.effective).toContain(s);
      }
      // mismatch reported
      expect(result.signals.mismatch).toBeDefined();
      expect(result.signals.mismatch!.undeclared.length).toBeGreaterThan(0);
    });
  });

  describe("CLI override", () => {
    it("autoDetect input overrides manifest auto_detect=false (default)", () => {
      // manifest doesn't set auto_detect, CLI sets it true
      const result = assemble({
        projectPath: FIXTURE_DIR,
        autoDetect: true,
      });

      expect(result.signals.detected.length).toBeGreaterThan(0);
      expect(result.signals.effective.length).toBeGreaterThan(result.signals.declared.length);
    });
  });

  describe("empty detection", () => {
    it("when docs have no signal keywords, detected is empty, effective equals declared", () => {
      const result = assemble({
        projectPath: NO_SIGNALS_FIXTURE_DIR,
        autoDetect: true,
        warnOnMismatch: true,
      });

      expect(result.signals.declared).toEqual(["payments"]);
      expect(result.signals.detected).toEqual([]);
      expect(result.signals.effective).toEqual(["payments"]);
      // stale signals should be reported (declared "payments" not found)
      expect(result.signals.mismatch).toBeDefined();
      expect(result.signals.mismatch!.stale).toContain("payments");
      expect(result.signals.mismatch!.undeclared).toEqual([]);
    });
  });

  describe("confidence threshold", () => {
    it("only high+medium confidence signals appear in detected", () => {
      const result = assemble({
        projectPath: FIXTURE_DIR,
        autoDetect: true,
      });

      // from the fixture, low-confidence signals like "caching", "database",
      // "external-api", "high-traffic", "webhooks" should NOT be in detected
      // only high+medium: rate-limiting, authentication, database-migration, payments
      expect(result.signals.detected).toContain("rate-limiting");
      expect(result.signals.detected).toContain("authentication");
      expect(result.signals.detected).not.toContain("caching");
    });
  });

  describe("manifest-driven defaults", () => {
    it("auto_detect and warn_on_mismatch are read from manifest when CLI flags are absent", () => {
      // manifest-autodetect-project has auto_detect: true and warn_on_mismatch: true
      // No CLI overrides passed — manifest settings should drive behavior
      const result = assemble({ projectPath: MANIFEST_AUTODETECT_DIR });

      // detection should have run (manifest auto_detect: true)
      expect(result.signals.detected.length).toBeGreaterThan(0);
      // effective should be union (auto_detect merges)
      expect(result.signals.effective.length).toBeGreaterThan(result.signals.declared.length);
      // mismatch should be reported (manifest warn_on_mismatch: true)
      expect(result.signals.mismatch).toBeDefined();
      expect(result.signals.mismatch!.undeclared.length).toBeGreaterThan(0);
    });

    it("CLI false overrides manifest true", () => {
      // manifest has auto_detect: true, but CLI says false
      const result = assemble({
        projectPath: MANIFEST_AUTODETECT_DIR,
        autoDetect: false,
        warnOnMismatch: false,
      });

      // CLI false should win over manifest true
      expect(result.signals.detected).toEqual([]);
      expect(result.signals.effective).toEqual(result.signals.declared);
      expect(result.signals.mismatch).toBeUndefined();
    });
  });

  describe("mismatch details", () => {
    it("correctly identifies undeclared and stale signals", () => {
      const result = assemble({
        projectPath: FIXTURE_DIR,
        warnOnMismatch: true,
      });

      const mismatch = result.signals.mismatch!;
      // undeclared = detected at high/medium but not in declared list
      // rate-limiting, authentication, database-migration are detected but not declared
      expect(mismatch.undeclared).toContain("rate-limiting");
      expect(mismatch.undeclared).toContain("authentication");
      expect(mismatch.undeclared).toContain("database-migration");

      // stale = declared but not detected at high/medium
      // external-api and webhooks are declared but only detected at low confidence
      expect(mismatch.stale).toContain("external-api");
      expect(mismatch.stale).toContain("webhooks");

      // payments is both declared AND detected at medium, so it's neither undeclared nor stale
      expect(mismatch.undeclared).not.toContain("payments");
      expect(mismatch.stale).not.toContain("payments");
    });
  });

  describe("lint onProgress mismatch warnings", () => {
    it("emits undeclared and stale warnings via onProgress when mismatch exists", async () => {
      const messages: string[] = [];
      const mockEngine: EvaluationEngine = {
        evaluate: vi.fn().mockResolvedValue({ ok: true, content: '{"findings":[]}' }),
      };

      await lint({
        projectPath: FIXTURE_DIR,
        engine: mockEngine,
        warnOnMismatch: true,
        onProgress: (msg) => messages.push(msg),
      });

      const undeclaredWarning = messages.find((m) => m.includes("Signals detected in docs but not declared"));
      const staleWarning = messages.find((m) => m.includes("Declared signals not found in docs"));

      expect(undeclaredWarning).toBeDefined();
      expect(undeclaredWarning).toContain("rate-limiting");
      expect(staleWarning).toBeDefined();
      expect(staleWarning).toContain("external-api");
    });

    it("does not emit mismatch warnings when warnOnMismatch is false", async () => {
      const messages: string[] = [];
      const mockEngine: EvaluationEngine = {
        evaluate: vi.fn().mockResolvedValue({ ok: true, content: '{"findings":[]}' }),
      };

      await lint({
        projectPath: FIXTURE_DIR,
        engine: mockEngine,
        onProgress: (msg) => messages.push(msg),
      });

      const mismatchWarnings = messages.filter((m) => m.startsWith("Warning:"));
      expect(mismatchWarnings).toHaveLength(0);
    });
  });

  describe("version bump", () => {
    it("assemble returns version 2.0", () => {
      const result = assemble({ projectPath: FIXTURE_DIR });
      expect(result.version).toBe("2.0");
    });
  });
});
