#!/usr/bin/env node
import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { execa } from "execa";
import { copy, ensureDir, readJson, remove, writeJson } from "fs-extra/esm";
import minimist from "minimist";
import ora from "ora";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory where this file is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Template path
const TEMPLATE_PATH = resolve(__dirname, "../template");

// Export the main function for testing
export async function createReactApp(cliArgs = process.argv.slice(2)) {
  // Parse command line arguments
  const argv = minimist(cliArgs);

  console.log("argv:", argv);

  console.log(
    chalk.bold.cyan("\n🚀 Welcome to React SWC TypeScript Extended!\n"),
  );

  try {
    // Get project name from command line argument or prompt
    let projectName;
    if (argv._[0]) {
      console.log("Setting from argv._[0]");
      projectName = argv._[0];
    } else {
      console.log("Setting from input");
      projectName = await input({
        message: "Project name:",
        default: "my-react-app",
        validate: (input) => {
          if (/^[a-zA-Z0-9-_]+$/.test(input)) return true;
          return "Project name may only contain letters, numbers, dashes and underscores.";
        },
      });
    }

    // Validate project name
    if (!projectName.trim()) {
      console.error(chalk.red("Error: Project name cannot be empty"));
      process.exit(1);
    }

    // Project destination
    const projectPath = resolve(process.cwd(), projectName);

    // Check if the directory already exists
    if (existsSync(projectPath)) {
      // Skip prompt if --force flag is used
      let shouldOverwrite;
      if (argv.force || argv.f) {
        shouldOverwrite = true;
      } else {
        shouldOverwrite = await confirm({
          message: `Directory ${projectName} already exists. Overwrite?`,
          default: false,
        });
      }

      if (shouldOverwrite) {
        const spinner = ora(
          `Removing existing directory ${projectName}...`,
        ).start();
        await remove(projectPath);
        spinner.succeed(`Removed directory ${projectName}`);
      } else {
        console.log(chalk.red("✖ Operation cancelled"));
        return;
      }
    }

    // Choose package manager ?
    let packageManager: string;
    if (argv.pm) {
      packageManager = argv.pm as string;
    } else if (argv.npm) {
      packageManager = "npm";
    } else if (argv.pnpm) {
      packageManager = "pnpm";
    } else if (argv.yarn) {
      packageManager = "yarn";
    } else {
      packageManager = await select({
        message: "Select a package manager:",
        choices: [
          { name: "npm", value: "npm" },
          { name: "pnpm", value: "pnpm" },
          { name: "yarn", value: "yarn" },
        ],
      });
    }

    // Initialize git repository ?
    let shouldInitGit;
    if (argv.git === false) {
      shouldInitGit = false;
    } else if (argv.git || argv.g) {
      shouldInitGit = true;
    } else {
      shouldInitGit = await confirm({
        message: "Initialize git repository?",
        default: true,
      });
    }

    // Create project directory - this is where our test will throw an error
    console.log("Creating project directory:", projectPath);
    await ensureDir(projectPath);
    console.log("Project directory created successfully");

    // Copy template files
    const spinner = ora("Copying project template...").start();
    await copy(TEMPLATE_PATH, projectPath);

    spinner.text = "Customizing project configuration...";

    // Update package.json
    const packageJsonPath = resolve(projectPath, "package.json");
    const packageJson = (await readJson(packageJsonPath)) as Record<
      string,
      unknown
    >;
    packageJson.name = projectName;
    await writeJson(packageJsonPath, packageJson, { spaces: 2 });

    spinner.succeed("Project structure created");

    // Install dependencies
    spinner.start("Installing dependencies...");
    const installCmd =
      packageManager === "npm"
        ? "install"
        : packageManager === "pnpm"
          ? "install"
          : "install";

    await execa(packageManager, [installCmd], { cwd: projectPath });

    spinner.succeed("Dependencies installed");

    // Initialize git repo if requested
    if (shouldInitGit) {
      spinner.start("Initializing git repository...");
      await execa("git", ["init"], { cwd: projectPath });
      await execa("git", ["add", "."], { cwd: projectPath });
      await execa("git", ["commit", "-m", "Initial commit"], {
        cwd: projectPath,
      });
      spinner.succeed("Git repository initialized");
    }

    // Done
    console.log(chalk.green("\n✓ Project created successfully!"));
    console.log("To get started:");
    console.log(chalk.cyan(`  cd ${projectName}`));
    console.log(
      chalk.cyan(
        `  ${packageManager === "npm" ? "npm run" : packageManager} dev\n`,
      ),
    );

    return { success: true, projectPath, projectName, packageManager };
  } catch (error) {
    console.error(
      chalk.red(
        `\nError caught in createReactApp: ${error instanceof Error ? error.message : "An unknown error occurred"}`,
      ),
    );

    console.log("About to call process.exit(1)");
    process.exit(1);
  }
}

// Only run the CLI when this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void createReactApp();
}
