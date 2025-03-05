import { writeFile } from "fs-extra";
import path from "node:path";

/**
 * Gets the latest versions of dependencies from npm
 * @param dependencies Object of dependencies
 * @returns Object with latest versions
 */
export function getLatestVersions(
  dependencies: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [pkg] of Object.entries(dependencies)) {
    result[pkg] = "latest";
  }

  return result;
}

/**
 * Creates gitignore file from template
 * @param projectPath Path to project
 */
export async function createGitignore(projectPath: string): Promise<void> {
  const gitignorePath = path.join(projectPath, ".gitignore");
  const content = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Testing
coverage
`;

  await writeFile(gitignorePath, content);
}
