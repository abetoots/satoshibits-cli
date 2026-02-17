import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

// file patterns for each document role, ordered by specificity
export const ROLE_PATTERNS: Record<string, string[]> = {
  brd: [
    "**/brd.md",
    "**/BRD.md",
    "**/*-brd.md",
    "**/*_brd.md",
    "**/*-brd-*.md",
    "**/business-requirements*",
    "**/business_requirements*",
    "**/requirements.md",
  ],
  frd: [
    "**/frd.md",
    "**/FRD.md",
    "**/*-frd.md",
    "**/*_frd.md",
    "**/*-frd-*.md",
    "**/functional-spec*",
    "**/functional_spec*",
    "**/functional-requirements*",
    "**/functional_requirements*",
    "**/features.md",
  ],
  add: [
    "**/add.md",
    "**/ADD.md",
    "**/*-add.md",
    "**/*_add.md",
    "**/*-add-*.md",
    "**/architecture*.md",
    "**/ARCHITECTURE*.md",
    "**/design.md",
    "**/system-design*",
    "**/system_design*",
  ],
  api_spec: [
    "**/openapi.yaml",
    "**/openapi.yml",
    "**/openapi.json",
    "**/swagger.yaml",
    "**/swagger.yml",
    "**/swagger.json",
    "**/asyncapi.yaml",
    "**/asyncapi.yml",
  ],
  runbook: [
    "**/runbook*",
    "**/*-runbook*",
    "**/*_runbook*",
    "**/ops/runbook*",
    "**/playbook*",
  ],
  security_standards: [
    "**/security-policy*",
    "**/security_policy*",
    "**/security-standards*",
    "**/security_standards*",
  ],
};

export const REQUIRED_ROLES = ["brd", "frd", "add"] as const;

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
  ".pdf", ".zip", ".gz", ".tar", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4", ".wav", ".avi", ".mov",
  ".sqlite", ".db",
]);

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function isValidFile(filePath: string): boolean {
  try {
    if (isBinaryFile(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (stat.size > MAX_FILE_SIZE) return false;
    return true;
  } catch {
    return false;
  }
}

export interface DiscoveryResult {
  // role -> list of candidate file paths (relative to project)
  candidates: Record<string, string[]>;
  // roles where no candidates were found
  missingRoles: string[];
}

// discover documents matching role patterns in a project directory.
// returns relative paths grouped by role.
export async function discoverDocuments(
  projectPath: string,
  customIgnore?: string[],
): Promise<DiscoveryResult> {
  const candidates: Record<string, string[]> = {};
  const missingRoles: string[] = [];
  const ignorePatterns = customIgnore
    ? [...IGNORE_PATTERNS, ...customIgnore]
    : IGNORE_PATTERNS;

  for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
    const matches: string[] = [];

    for (const pattern of patterns) {
      const found = await glob(pattern, {
        cwd: projectPath,
        ignore: ignorePatterns,
        nodir: true,
      });
      for (const f of found) {
        if (!matches.includes(f)) {
          const absPath = path.resolve(projectPath, f);
          if (isValidFile(absPath)) {
            matches.push(f);
          }
        }
      }
    }

    if (matches.length > 0) {
      candidates[role] = matches;
    } else {
      missingRoles.push(role);
    }
  }

  return { candidates, missingRoles };
}

// check which required roles are missing from discovery results
export function getMissingRequiredRoles(result: DiscoveryResult): string[] {
  return REQUIRED_ROLES.filter((role) => result.missingRoles.includes(role));
}
