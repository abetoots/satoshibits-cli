/**
 * Derives the version of @satoshibits/claude-skill-runtime from the installed package
 * instead of hardcoding it, ensuring version consistency across the workspace.
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);

interface PackageJson {
  version: string;
}

// read version from the installed runtime package
const runtimePkg = require(
  "@satoshibits/claude-skill-runtime/package.json",
) as PackageJson;

/**
 * The version of @satoshibits/claude-skill-runtime to use in generated package.json files.
 * Uses caret (^) for semver compatibility.
 */
export const RUNTIME_VERSION = `^${runtimePkg.version}`;

/**
 * The exact version of @satoshibits/claude-skill-runtime (without caret).
 */
export const RUNTIME_VERSION_EXACT = runtimePkg.version;
