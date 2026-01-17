import { input } from "@inquirer/prompts";
import { execa } from "execa";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageName = await input({ message: "Enter package name" });
const description = await input({ message: "Enter package description" });

try {
  const { stdout } = await execa({
    stdout: process.stdout,
    stderr: process.stderr,
  })`bash ${__dirname}/add-package.sh -n ${packageName} -d ${description}`;
  console.log(stdout);
} catch (error) {
  console.error(error.message);
}
