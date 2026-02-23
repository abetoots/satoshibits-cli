#!/usr/bin/env node

/**
 * Pre-publish check: fails CI early when a package has never been published to npm.
 *
 * npm enforces 2FA on first-time publishes, so new packages must be published
 * manually before CI can take over. This script catches that before pnpm publish -r
 * runs into a cryptic auth failure mid-release.
 */

const { execSync } = require("child_process");
const { readdirSync, readFileSync } = require("fs");
const { join } = require("path");

const packagesDir = join(__dirname, "..", "packages");
const newPackages = [];

for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;

  let pkg;
  try {
    pkg = JSON.parse(
      readFileSync(join(packagesDir, dir.name, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }

  if (pkg.private) continue;

  try {
    execSync(`npm view "${pkg.name}" version`, { stdio: "pipe" });
  } catch {
    newPackages.push({ name: pkg.name, dir: dir.name });
  }
}

if (newPackages.length > 0) {
  console.error(
    "\n[pre-publish] New packages detected that have never been published to npm:\n",
  );
  for (const { name } of newPackages) {
    console.error(`  - ${name}`);
  }
  console.error("\nnpm requires 2FA for first-time package publishing.");
  console.error("Publish these manually first:\n");
  for (const { name, dir } of newPackages) {
    console.error(`  cd packages/${dir} && npm publish --access public`);
  }
  console.error(
    "\nThen update your npm granular access token to include the new package.",
  );
  console.error("After that, CI handles all subsequent releases.\n");
  process.exit(1);
}

console.log("[pre-publish] All packages already exist on npm registry.");
