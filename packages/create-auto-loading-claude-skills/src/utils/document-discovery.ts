import { glob } from "glob";
import fs from "fs";
import path from "path";

export interface DocMatch {
  path: string;
  confidence: number;
  matchedKeywords: string[];
}

export class DocumentDiscovery {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Find exact name matches
   */
  findExactMatches(skillName: string): string[] {
    const patterns = [
      `docs/**/*${skillName}*.md`,
      `docs/**/*${skillName}*.mdx`,
      `*${skillName}*.md`, // check root files like CONTRIBUTING.md
    ];

    const matches = new Set<string>();

    for (const pattern of patterns) {
      const files = glob.sync(pattern, { cwd: this.projectDir, nocase: true });
      files.forEach((f) => matches.add(f));
    }

    return Array.from(matches);
  }

  /**
   * Find keyword-based matches (fuzzy search)
   */
  findKeywordMatches(keywords: string[], description = ""): DocMatch[] {
    const allKeywords = [...keywords, ...this.extractKeywords(description)];
    const docPatterns = ["docs/**/*.md", "docs/**/*.mdx", "*.md"];

    const allDocs: string[] = [];
    for (const pattern of docPatterns) {
      const files = glob.sync(pattern, { cwd: this.projectDir });
      allDocs.push(...files);
    }

    const MAX_FILE_SIZE = 1024 * 1024; // 1MB max

    return allDocs
      .map((doc) => {
        const fullPath = path.join(this.projectDir, doc);

        try {
          // skip large files to avoid memory issues
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) {
            return null;
          }

          const content = fs.readFileSync(fullPath, "utf8").toLowerCase();
          const matches = allKeywords.filter((kw) =>
            content.includes(kw.toLowerCase()),
          );

          return {
            path: doc,
            confidence: (matches.length / allKeywords.length) * 100,
            matchedKeywords: matches,
          };
        } catch {
          // skip files that can't be read (permission denied, etc.)
          return null;
        }
      })
      .filter(
        (result): result is DocMatch =>
          result !== null && result.confidence > 30,
      )
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if skill already exists
   */
  checkExistingSkill(skillName: string): {
    exists: boolean;
    content?: string;
    resources?: { name: string; isSymlink: boolean; target: string | null }[];
    lastModified?: Date;
  } {
    const skillPath = path.join(
      this.projectDir,
      ".claude",
      "skills",
      skillName,
      "SKILL.md",
    );

    if (fs.existsSync(skillPath)) {
      return {
        exists: true,
        content: fs.readFileSync(skillPath, "utf8"),
        resources: this.getExistingResources(skillName),
        lastModified: fs.statSync(skillPath).mtime,
      };
    }

    return { exists: false };
  }

  /**
   * Get existing resources for a skill
   */
  private getExistingResources(
    skillName: string,
  ): { name: string; isSymlink: boolean; target: string | null }[] {
    const resourceDir = path.join(
      this.projectDir,
      ".claude",
      "skills",
      skillName,
      "resources",
    );

    if (!fs.existsSync(resourceDir)) return [];

    return fs.readdirSync(resourceDir).map((file) => {
      const filePath = path.join(resourceDir, file);
      const stats = fs.lstatSync(filePath);

      return {
        name: file,
        isSymlink: stats.isSymbolicLink(),
        target: stats.isSymbolicLink() ? fs.readlinkSync(filePath) : null,
      };
    });
  }

  /**
   * Extract keywords from description
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // simple keyword extraction - split on spaces, remove common words
    const commonWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "for",
      "with",
      "to",
      "from",
      "in",
      "on",
      "at",
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3 && !commonWords.has(word));
  }
}
