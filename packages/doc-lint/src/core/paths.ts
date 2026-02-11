import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

let _packageRoot: string | null = null;

// walk up from this module's location to find the package root
// works regardless of build output structure (dist/src/core/, dist/core/, etc.)
export function getPackageRoot(): string {
  if (_packageRoot) return _packageRoot;

  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { name?: string };
        if (pkg.name === "@satoshibits/doc-lint") {
          _packageRoot = dir;
          return dir;
        }
      } catch {
        // malformed package.json, keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error("Could not find @satoshibits/doc-lint package root");
}

export function getConcernsDir(): string {
  return path.join(getPackageRoot(), "concerns");
}
