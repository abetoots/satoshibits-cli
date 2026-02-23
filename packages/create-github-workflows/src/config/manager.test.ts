/**
 * Tests for config manager
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";

import {
  configExists,
  createDefaultConfig,
  getInstalledWorkflows,
  loadConfig,
  saveConfig,
} from "./manager.js";

// mock fs module
vi.mock("node:fs");

const mockFs = vi.mocked(fs);

describe("configExists", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when config file exists", () => {
    mockFs.existsSync.mockReturnValue(true);

    expect(configExists("/test")).toBe(true);
  });

  it("returns false when config file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(configExists("/test")).toBe(false);
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads and parses config file", () => {
    const mockConfig = {
      version: 1,
      projectName: "test-project",
      preset: "library",
      packageManager: "pnpm",
      releaseStrategy: "release-please",
      nodeVersion: "20",
      isMonorepo: false,
      docker: null,
      deployEnvironments: [],
      workflows: ["pr-validation", "release-please"],
      npm: { publish: true, access: "public" },
      createdAt: "2024-01-01",
    };

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    const result = loadConfig("/test");

    expect(result).toEqual(mockConfig);
  });

  it("returns null when config file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(loadConfig("/test")).toBeNull();
  });

  it("returns null on parse error", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("invalid json");

    expect(loadConfig("/test")).toBeNull();
  });
});

describe("saveConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("saves config to file", () => {
    const config = createDefaultConfig(
      "test-project",
      "library",
      "pnpm",
      "release-please",
      "20",
      false,
      ["pr-validation"],
    );

    saveConfig(config, "/test");

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".github-workflows.json"),
      expect.stringContaining('"projectName": "test-project"'),
      "utf-8",
    );
  });
});

describe("createDefaultConfig", () => {
  it("creates config with correct defaults", () => {
    const config = createDefaultConfig(
      "my-project",
      "library",
      "npm",
      "release-please",
      "20",
      false,
      ["pr-validation", "release-please", "npm"],
    );

    expect(config.version).toBe(1);
    expect(config.projectName).toBe("my-project");
    expect(config.preset).toBe("library");
    expect(config.packageManager).toBe("npm");
    expect(config.releaseStrategy).toBe("release-please");
    expect(config.nodeVersion).toBe("20");
    expect(config.isMonorepo).toBe(false);
    expect(config.docker).toBeNull();
    expect(config.deployEnvironments).toEqual([]);
    expect(config.workflows).toEqual([
      "pr-validation",
      "release-please",
      "npm",
    ]);
    expect(config.npm).toBeNull();
    expect(config.docs).toBeNull();
    expect(config.createdAt).toBeDefined();
  });
});

describe("getInstalledWorkflows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns list of workflow files", () => {
    mockFs.existsSync.mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    mockFs.readdirSync.mockReturnValue([
      "pr-validation.yml",
      "release-please.yml",
      "README.md",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = getInstalledWorkflows("/test");

    expect(result).toEqual(["pr-validation.yml", "release-please.yml"]);
  });

  it("returns empty array when workflows directory does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);

    const result = getInstalledWorkflows("/test");

    expect(result).toEqual([]);
  });
});
