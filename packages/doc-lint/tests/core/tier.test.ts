import { describe, it, expect } from "vitest";

import { parseTierFlag } from "../../src/core/tier.js";

describe("parseTierFlag", () => {
  it("parses numeric tiers", () => {
    expect(parseTierFlag("1")).toBe(1);
    expect(parseTierFlag("2")).toBe(2);
    expect(parseTierFlag("3")).toBe(3);
  });

  it("parses 'all'", () => {
    expect(parseTierFlag("all")).toBe("all");
  });

  it("rejects invalid values", () => {
    expect(parseTierFlag("0")).toBeNull();
    expect(parseTierFlag("4")).toBeNull();
    expect(parseTierFlag("foo")).toBeNull();
    expect(parseTierFlag("")).toBeNull();
  });
});
