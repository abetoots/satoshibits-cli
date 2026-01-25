import fs from "fs";
import path from "path";

export interface DocumentSuggestion {
  docPath: string;
  suggestedSkillName: string;
  suggestedKeywords: string[];
  confidence: number;
  allFiles?: string[]; // all files matching this doc type (for creating multiple resources)
}

export interface KeywordMatch {
  path: string;
  keywords: string[];
  confidence: number;
  description?: string;
}

export interface DiscoveryCache {
  version: string;
  discoveredAt: string;
  projectRoot: string;
  exactMatches: Record<string, string[]>;
  keywordMatches: KeywordMatch[];
  suggestions: DocumentSuggestion[];
}

/**
 * Manages discovery cache persistence
 */
export class DiscoveryCacheManager {
  private cacheDir: string;
  private cacheFile: string;

  constructor(projectDir: string) {
    this.cacheDir = path.join(projectDir, ".claude", "cache");
    this.cacheFile = path.join(this.cacheDir, "discovered-docs.json");
  }

  /**
   * Get default max age in milliseconds (7 days, configurable via env var)
   * Evaluated dynamically to support env var changes
   */
  private static getDefaultMaxAge(): number {
    return process.env.DOC_CACHE_TTL_DAYS
      ? parseInt(process.env.DOC_CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  }

  /**
   * Save discovery results to cache
   */
  save(
    exactMatches: Record<string, string[]>,
    keywordMatches: KeywordMatch[] = [],
    suggestions: DocumentSuggestion[] = [],
  ): void {
    // ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const cache: DiscoveryCache = {
      version: "1.0",
      discoveredAt: new Date().toISOString(),
      projectRoot: path.dirname(path.dirname(this.cacheDir)),
      exactMatches,
      keywordMatches,
      suggestions,
    };

    // atomic write (temp + rename)
    const tempFile = `${this.cacheFile}.tmp`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(cache, null, 2), "utf8");
      fs.renameSync(tempFile, this.cacheFile);
    } catch (error) {
      // cleanup temp file if write failed
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw error;
    }
  }

  /**
   * Load discovery results from cache
   */
  load(): DiscoveryCache | null {
    if (!fs.existsSync(this.cacheFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.cacheFile, "utf8");
      const cache = JSON.parse(content) as DiscoveryCache;

      // validate version
      if (cache.version !== "1.0") {
        console.warn("Discovery cache version mismatch, ignoring");
        return null;
      }

      return cache;
    } catch (error) {
      // corrupted cache, return null
      if (process.env.DEBUG) {
        console.warn("Failed to load discovery cache:", error);
      }
      return null;
    }
  }

  /**
   * Check if cache exists and is recent
   */
  exists(): boolean {
    return fs.existsSync(this.cacheFile);
  }

  /**
   * Get cache age in milliseconds
   */
  getAge(): number | null {
    const cache = this.load();
    if (!cache) return null;

    const discoveredAt = new Date(cache.discoveredAt);
    return Date.now() - discoveredAt.getTime();
  }

  /**
   * Check if cache is stale
   * @param maxAge - Max age in milliseconds (defaults to 7 days or DOC_CACHE_TTL_DAYS env var)
   * @returns true if cache is stale or doesn't exist
   */
  isStale(maxAge?: number): boolean {
    const effectiveMaxAge = maxAge ?? DiscoveryCacheManager.getDefaultMaxAge();
    const age = this.getAge();
    return age === null || age >= effectiveMaxAge;
  }

  /**
   * Check if cache is fresh
   * @param maxAge - Max age in milliseconds (defaults to 7 days or DOC_CACHE_TTL_DAYS env var)
   * @returns true if cache exists and is within maxAge
   */
  isFresh(maxAge?: number): boolean {
    return !this.isStale(maxAge);
  }

  /**
   * Load cache only if fresh, clear if stale
   * @param maxAge - Max age in milliseconds
   * @returns Cache data if fresh, null if stale or corrupted
   */
  loadIfFresh(maxAge?: number): DiscoveryCache | null {
    // check if cache file exists first
    if (!fs.existsSync(this.cacheFile)) {
      return null;
    }

    // try to load to check if corrupted (before staleness check)
    let cache: DiscoveryCache | null;
    try {
      const content = fs.readFileSync(this.cacheFile, "utf8");
      cache = JSON.parse(content) as DiscoveryCache;
    } catch {
      // corrupted cache - log warning and clear
      console.warn("Warning: Discovery cache corrupted, clearing...");
      this.clear();
      return null;
    }

    // now check staleness
    if (this.isStale(maxAge)) {
      this.clear();
      return null;
    }

    return cache;
  }

  /**
   * Clear cache
   */
  clear(): void {
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }

  /**
   * Get total discovered document count
   */
  getDocumentCount(): number {
    const cache = this.load();
    if (!cache) return 0;

    const exactCount = Object.values(cache.exactMatches).reduce(
      (sum, files) => sum + files.length,
      0,
    );
    const keywordCount = cache.keywordMatches.length;

    return exactCount + keywordCount;
  }

  /**
   * Generate suggestions from exact matches
   */
  generateSuggestions(
    exactMatches: Record<string, string[]>,
  ): DocumentSuggestion[] {
    const suggestions: DocumentSuggestion[] = [];

    for (const [docName, files] of Object.entries(exactMatches)) {
      // skip empty file arrays
      if (!files || files.length === 0) {
        continue;
      }

      // create one suggestion per docName with all matching files
      // use primary file (shortest path, usually root) for display
      // non-null assertion is safe because we check files.length above
      const primaryFile = files.sort((a, b) => a.length - b.length)[0]!;

      suggestions.push({
        docPath: primaryFile,
        suggestedSkillName: docName.toLowerCase().replace(/_/g, "-"),
        suggestedKeywords: this.inferKeywords(docName, primaryFile),
        confidence: 95,
        // store all matching files for resource creation
        allFiles: files,
      });
    }

    return suggestions;
  }

  /**
   * Infer keywords from document name
   */
  private inferKeywords(docName: string, filePath: string): string[] {
    const keywords: string[] = [];

    // add document name variations
    keywords.push(docName.toLowerCase());
    keywords.push(...docName.toLowerCase().split("_"));

    // infer from file path
    const basename = path.basename(filePath, path.extname(filePath));
    if (basename !== docName) {
      keywords.push(basename.toLowerCase());
    }

    // add common synonyms
    const synonyms: Record<string, string[]> = {
      contributing: ["contribution", "pull request", "pr", "code review"],
      architecture: ["design", "structure", "patterns", "arch"],
      api: ["endpoint", "route", "REST", "GraphQL"],
      testing: ["test", "spec", "TDD", "unit test"],
      deployment: ["deploy", "CD", "release", "production"],
      security: ["auth", "authorization", "authentication"],
    };

    for (const [key, values] of Object.entries(synonyms)) {
      if (docName.toLowerCase().includes(key)) {
        keywords.push(...values);
      }
    }

    // deduplicate
    return [...new Set(keywords)];
  }
}
