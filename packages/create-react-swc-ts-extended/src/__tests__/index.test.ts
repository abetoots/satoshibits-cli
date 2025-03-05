import { confirm, input, select } from "@inquirer/prompts";
import { ensureDir, readJson, remove, writeJson } from "fs-extra/esm";
import minimist from "minimist";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "node:assert";
import { existsSync } from "node:fs";
import { afterEach } from "node:test";

import { createReactApp } from "../index";

// Mock dependencies
vi.mock("fs-extra/esm", () => ({
  copy: vi.fn().mockResolvedValue(undefined),
  readJson: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  writeJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ exitCode: 0 }),
}));

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));

vi.mock("minimist", () => ({
  default: vi.fn().mockReturnValue({ _: [] }),
}));

vi.mock("ora", () => ({
  default: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

describe("CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Optionally reset all modules between tests
    // vi.resetModules();
    // Mock process.exit to prevent tests from exiting
    // vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    //   vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("should create a project with the correct name", async () => {
    // Mock prompt responses and make sure they are only called once
    // If they are called more than once, the test will fail since the
    // mocked values are only set to return once
    vi.mocked(input).mockResolvedValueOnce("test-project");
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(select).mockResolvedValueOnce("npm");

    // Mock fs-extra functions
    vi.mocked(existsSync).mockReturnValueOnce(false);
    vi.mocked(readJson).mockResolvedValueOnce({
      name: "react-swc-ts-extended",
      version: "0.0.0",
    });

    // Execute the function being tested directly
    await createReactApp([]);

    // Verify the expected calls
    expect(ensureDir).toHaveBeenCalledTimes(1);
    expect(ensureDir).toHaveBeenCalledWith(
      expect.stringContaining("test-project"),
    );
    expect(writeJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: "test-project",
      }),
      { spaces: 2 },
    );
  });

  it("should use command line arguments when provided", async () => {
    // Mock minimist to return CLI args
    vi.mocked(minimist).mockReturnValueOnce({
      _: ["cli-arg-project"],
      pnpm: true,
      git: true,
    });

    // Mock fs-extra functions
    vi.mocked(existsSync).mockReturnValueOnce(false);
    vi.mocked(readJson).mockResolvedValueOnce({
      name: "react-swc-ts-extended",
      version: "0.0.0",
    });

    // Execute the function with our CLI args
    await createReactApp(["cli-arg-project", "--pnpm", "--git"]);

    // We shouldn't have prompted for project name
    expect(input).not.toHaveBeenCalled();

    // We shouldn't have prompted for package manager
    expect(select).not.toHaveBeenCalled();

    // We shouldn't have prompted for git initialization
    expect(confirm).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Initialize git repository?",
      }),
    );

    // Verify the expected calls with CLI argument name
    expect(ensureDir).toHaveBeenCalledTimes(1);
    expect(ensureDir).toHaveBeenCalledWith(
      expect.stringContaining("cli-arg-project"),
    );
    expect(writeJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: "cli-arg-project",
      }),
      { spaces: 2 },
    );
  });

  it("should handle existing directory", async () => {
    // Mock prompt responses
    vi.mocked(input).mockResolvedValueOnce("existing-project");
    vi.mocked(confirm).mockResolvedValueOnce(true); // overwrite
    vi.mocked(confirm).mockResolvedValueOnce(false); // git init
    vi.mocked(select).mockResolvedValueOnce("pnpm");

    // Mock fs-extra functions
    vi.mocked(existsSync).mockReturnValueOnce(true);

    // Execute the CLI
    await createReactApp([]);

    // Verify the project directory was removed and created again
    expect(remove).toHaveBeenCalled();
  });

  it("should handle force flag for existing directory", async () => {
    // Properly type the mocked function
    vi.mocked(minimist).mockReturnValueOnce({
      _: ["existing-dir"],
      force: true,
    });

    // Mock fs-extra functions
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(readJson).mockResolvedValueOnce({
      name: "react-swc-ts-extended",
      version: "0.0.0",
    });

    // Execute CLI
    await createReactApp(["existing-dir", "--force"]);

    // We shouldn't have prompted about overwriting
    expect(confirm).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("already exists") as string,
      }),
    );

    // Should have removed the existing directory without asking
    expect(remove).toHaveBeenCalled();
  });

  it("should handle the pm flag for package manager selection", async () => {
    vi.mocked(minimist).mockReturnValueOnce({
      _: ["pm-test-project"],
      pm: "yarn",
    });

    // Mock fs-extra functions
    vi.mocked(existsSync).mockReturnValueOnce(false);
    vi.mocked(readJson).mockResolvedValueOnce({
      name: "react-swc-ts-extended",
      version: "0.0.0",
    });

    // Import to run CLI
    const execaModule = await import("execa");
    await createReactApp(["pm-test-project", "--pm", "yarn"]);

    // Verify execa was called with yarn
    expect(execaModule.execa).toHaveBeenCalledWith(
      "yarn",
      ["install"],
      expect.any(Object),
    );
  });

  it("should handle git=false flag", async () => {
    // Mock command line arguments with git=false
    vi.mocked(minimist).mockReturnValueOnce({
      _: ["no-git-project"],
      git: false,
    });

    // Mock fs-extra functions
    vi.mocked(existsSync).mockReturnValueOnce(false);
    vi.mocked(readJson).mockResolvedValueOnce({
      name: "react-swc-ts-extended",
      version: "0.0.0",
    });

    // Import to run CLI
    const execaModule = await import("execa");
    await createReactApp(["no-git-project", "--git", "false"]);

    // Verify git init was not called
    expect(execaModule.execa).not.toHaveBeenCalledWith(
      "git",
      ["init"],
      expect.any(Object),
    );
  });

  it("should ensure eslint configuration is properly created", async () => {
    // Mock prompt responses
    vi.mocked(input).mockResolvedValueOnce("lint-test-project");
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(select).mockResolvedValueOnce("npm");

    // Mock fs functions
    vi.mocked(existsSync).mockReturnValueOnce(false);

    // Get the already mocked copy function instead of re-mocking it
    const { copy } = await import("fs-extra/esm");

    // Execute CLI
    await createReactApp([]);

    // Verify ESLint config is copied
    expect(copy).toHaveBeenCalledWith(
      expect.stringContaining("template"),
      expect.stringContaining("lint-test-project"),
    );
  });

  it("should ensure test configuration is properly created", async () => {
    // Mock prompt responses
    vi.mocked(input).mockResolvedValueOnce("test-config-project");
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(select).mockResolvedValueOnce("npm");

    // Mock fs functions
    vi.mocked(existsSync).mockReturnValueOnce(false);

    // Set up a mock package.json to check for test scripts
    const mockPackageJson = {
      name: "template-project",
      scripts: {
        test: "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
      },
      dependencies: {},
      devDependencies: {
        vitest: "^1.0.0",
        "@testing-library/react": "^14.0.0",
      },
    };

    vi.mocked(readJson).mockResolvedValueOnce(mockPackageJson);

    // Execute CLI
    await createReactApp([]);

    // Verify package.json is written with test scripts
    expect(writeJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        scripts: expect.objectContaining({
          test: expect.stringContaining("vitest") as string,
          "test:watch": expect.stringContaining("vitest") as string,
          "test:coverage": expect.stringContaining("vitest") as string,
        }),
      }),
      expect.any(Object),
    );
  });

  it("should ensure TypeScript configuration is properly created", async () => {
    // Mock prompt responses
    vi.mocked(input).mockResolvedValueOnce("ts-config-project");
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(select).mockResolvedValueOnce("npm");

    // Mock fs functions
    vi.mocked(existsSync).mockReturnValueOnce(false);

    // Mock package.json to check for typecheck script
    const mockPackageJson = {
      name: "template-project",
      scripts: {
        typecheck: "tsc --noEmit",
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
    };

    vi.mocked(readJson).mockResolvedValueOnce(mockPackageJson);

    // Execute CLI
    await createReactApp([]);

    // Verify package.json is written with typecheck script
    expect(writeJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        scripts: expect.objectContaining({
          typecheck: "tsc --noEmit",
        }),
      }),
      expect.any(Object),
    );
  });

  it("should handle error during project creation", async () => {
    // Mock process.exit
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit was called");
    });

    // Run the function and expect it to throw
    await expect(() => createReactApp([])).rejects.toThrow(
      "process.exit was called",
    );

    // Verify process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1);

    // Restore mocked function
    mockExit.mockRestore();
  });

  it("should exit if project name is empty", async () => {
    // Mock process.exit
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit was called");
    });

    // Mock command line arguments with empty project name
    const minimist = await import("minimist");
    vi.mocked(minimist.default).mockReturnValueOnce({ _: [""] });

    // Execute CLI
    await expect(() => createReactApp([""])).rejects.toThrow(
      "process.exit was called",
    );

    // Verify process.exit was called with status code 1
    expect(mockExit).toHaveBeenCalledWith(1);

    // Restore mocked function
    mockExit.mockRestore();
  });

  it("should validate project name for permitted characters", async () => {
    // Mock prompt for project name with validation
    const mockInput = vi.mocked(input);

    // Execute the CLI to trigger the input validation
    // We need to import and then immediately catch errors as we're not
    // providing all the responses needed
    try {
      await createReactApp([]);
    } catch {
      // Ignore errors as we're just testing the validation function
    }

    // Extract the validation function from the first call to input
    const validationFn = mockInput.mock.calls[0]?.[0]?.validate;

    if (validationFn) {
      // Test validation with valid names
      expect(validationFn("valid-name")).toBe(true);
      expect(validationFn("valid_name")).toBe(true);
      expect(validationFn("validName123")).toBe(true);

      // Test validation with invalid names
      expect(validationFn("invalid name")).not.toBe(true);
      expect(validationFn("invalid!name")).not.toBe(true);
      expect(validationFn("invalid@name")).not.toBe(true);
    } else {
      fail("Validation function was not called");
    }
  });
});
