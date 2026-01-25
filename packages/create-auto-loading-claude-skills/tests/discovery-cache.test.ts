/**
 * Discovery Cache Unit Tests
 *
 * Tests persistence, suggestion generation, and file grouping logic.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { DiscoveryCacheManager } from "../src/utils/discovery-cache.js";

const TEST_PROJECT_DIR = path.join(
  import.meta.dirname,
  "../__tests__/fixtures/cache-project",
);
const TEST_CACHE_FILE = path.join(
  TEST_PROJECT_DIR,
  ".claude/cache/discovered-docs.json",
);

describe("DiscoveryCacheManager", () => {
  beforeEach(() => {
    // clean up before each test
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  });

  afterEach(() => {
    // clean up after each test
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
    }
  });

  describe("save() and load()", () => {
    it("should save and load discovery results", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "CONTRIBUTING.md": ["docs/CONTRIBUTING.md"],
        "STYLE_GUIDE.md": ["docs/STYLE_GUIDE.md"],
      };

      cache.save(results);

      expect(fs.existsSync(TEST_CACHE_FILE)).toBe(true);

      const loaded = cache.load();
      expect(loaded).toBeTruthy();
      expect(loaded!.version).toBe("1.0");
      expect(loaded!.exactMatches).toEqual(results);
    });

    it("should create cache directory if it does not exist", () => {
      const nestedProjectDir = path.join(TEST_PROJECT_DIR, "nested/project");
      const cache = new DiscoveryCacheManager(nestedProjectDir);

      cache.save({ "TEST.md": ["test.md"] });

      const expectedCacheFile = path.join(
        nestedProjectDir,
        ".claude/cache/discovered-docs.json",
      );
      expect(fs.existsSync(expectedCacheFile)).toBe(true);
    });

    it("should return null when cache does not exist", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);
      const loaded = cache.load();

      expect(loaded).toBeNull();
    });

    it("should return null when cache is invalid JSON", () => {
      const cacheDir = path.join(TEST_PROJECT_DIR, ".claude/cache");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(TEST_CACHE_FILE, "{ invalid json }", "utf8");

      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);
      const loaded = cache.load();

      expect(loaded).toBeNull();
    });

    it("should use atomic write pattern (temp file + rename)", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      cache.save({ "TEST.md": ["test.md"] });

      // verify no .tmp files left behind
      const cacheDir = path.join(TEST_PROJECT_DIR, ".claude/cache");
      const files = fs.readdirSync(cacheDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));

      expect(tmpFiles.length).toBe(0);
    });
  });

  describe("generateSuggestions()", () => {
    it("should generate suggestions from discovery results", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "CONTRIBUTING.md": ["docs/CONTRIBUTING.md"],
        "API_GUIDELINES.md": ["docs/API_GUIDELINES.md"],
      };

      const suggestions = cache.generateSuggestions(results);

      expect(suggestions.length).toBe(2);

      const contributingSuggestion = suggestions.find(
        (s) => s.suggestedSkillName === "contributing.md",
      );
      expect(contributingSuggestion).toBeTruthy();
      expect(contributingSuggestion!.docPath).toBe("docs/CONTRIBUTING.md");
      expect(contributingSuggestion!.confidence).toBe(95);
      expect(contributingSuggestion!.suggestedKeywords.length).toBeGreaterThan(
        0,
      );
    });

    it("should convert doc names to kebab-case skill names", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "STYLE_GUIDE.md": ["docs/STYLE_GUIDE.md"],
        "API_GUIDELINES.md": ["docs/API_GUIDELINES.md"],
      };

      const suggestions = cache.generateSuggestions(results);

      // implementation converts underscores to hyphens
      expect(
        suggestions.some((s) => s.suggestedSkillName === "style-guide.md"),
      ).toBe(true);
      expect(
        suggestions.some((s) => s.suggestedSkillName === "api-guidelines.md"),
      ).toBe(true);
    });

    it("should infer keywords from document name", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "BACKEND_GUIDELINES.md": ["docs/BACKEND_GUIDELINES.md"],
      };

      const suggestions = cache.generateSuggestions(results);

      expect(suggestions.length).toBe(1);
      const keywords = suggestions[0]!.suggestedKeywords;

      expect(keywords).toContain("backend_guidelines.md");
      expect(keywords).toContain("backend");
      expect(keywords).toContain("guidelines.md");
    });

    it("should handle multiple files with same docName (grouping fix)", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      // multiple files matching the same document type
      const results = {
        "CONTRIBUTING.md": [
          "CONTRIBUTING.md",
          "docs/CONTRIBUTING.md",
          "internal/CONTRIBUTING.md",
        ],
      };

      const suggestions = cache.generateSuggestions(results);

      // should create ONE suggestion, not three
      expect(suggestions.length).toBe(1);

      const suggestion = suggestions[0]!;
      expect(suggestion.suggestedSkillName).toBe("contributing.md");

      // should include all files in allFiles array
      expect(suggestion.allFiles).toBeTruthy();
      expect(suggestion.allFiles!.length).toBe(3);
      expect(suggestion.allFiles).toContain("CONTRIBUTING.md");
      expect(suggestion.allFiles).toContain("docs/CONTRIBUTING.md");
      expect(suggestion.allFiles).toContain("internal/CONTRIBUTING.md");

      // primary file should be the shortest path
      expect(suggestion.docPath).toBe("CONTRIBUTING.md");
    });

    it("should select shortest path as primary file", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "README.md": [
          "very/long/nested/path/README.md",
          "shorter/README.md",
          "README.md",
        ],
      };

      const suggestions = cache.generateSuggestions(results);

      expect(suggestions.length).toBe(1);
      expect(suggestions[0]!.docPath).toBe("README.md");
    });

    it("should return empty array for empty results", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);
      const suggestions = cache.generateSuggestions({});

      expect(suggestions.length).toBe(0);
    });

    it("should handle single-word document names", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "SECURITY.md": ["SECURITY.md"],
      };

      const suggestions = cache.generateSuggestions(results);

      expect(suggestions.length).toBe(1);
      expect(suggestions[0]!.suggestedSkillName).toBe("security.md");
      expect(suggestions[0]!.suggestedKeywords).toContain("security.md");
    });

    it("should handle documents with numbers", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "API_V2_GUIDE.md": ["docs/API_V2_GUIDE.md"],
      };

      const suggestions = cache.generateSuggestions(results);

      expect(suggestions.length).toBe(1);
      // underscores converted to hyphens
      expect(suggestions[0]!.suggestedSkillName).toBe("api-v2-guide.md");
    });
  });

  describe("getDocumentCount()", () => {
    it("should return 0 when cache is empty", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);
      expect(cache.getDocumentCount()).toBe(0);
    });

    it("should return correct count", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      cache.save({
        "CONTRIBUTING.md": ["docs/CONTRIBUTING.md"],
        "API_GUIDE.md": ["docs/API_GUIDE.md"],
        "STYLE_GUIDE.md": ["docs/STYLE_GUIDE.md"],
      });

      expect(cache.getDocumentCount()).toBe(3);
    });

    it("should count total files across all document types", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      // multiple files of same type
      cache.save({
        "CONTRIBUTING.md": [
          "CONTRIBUTING.md",
          "docs/CONTRIBUTING.md",
          "internal/CONTRIBUTING.md",
        ],
        "README.md": ["README.md", "docs/README.md"],
      });

      // counts all files: 3 + 2 = 5
      expect(cache.getDocumentCount()).toBe(5);
    });
  });

  describe("clear()", () => {
    it("should delete cache file", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      cache.save({ "TEST.md": ["test.md"] });
      expect(fs.existsSync(TEST_CACHE_FILE)).toBe(true);

      cache.clear();
      expect(fs.existsSync(TEST_CACHE_FILE)).toBe(false);
    });

    it("should not throw if cache does not exist", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      expect(() => {
        cache.clear();
      }).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long file paths", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const longPath = "a/".repeat(100) + "GUIDE.md";
      const results = {
        "GUIDE.md": [longPath],
      };

      cache.save(results);
      const loaded = cache.load();

      expect(loaded).toBeTruthy();
      expect(loaded!.exactMatches).toEqual(results);
    });

    it("should handle special characters in file paths", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "GUIDE.md": ["docs/special-chars-@#$/GUIDE.md"],
      };

      cache.save(results);
      const loaded = cache.load();

      expect(loaded).toBeTruthy();
      expect(loaded!.exactMatches).toEqual(results);
    });

    it("should handle unicode in document names", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "ドキュメント.md": ["docs/ドキュメント.md"],
      };

      const suggestions = cache.generateSuggestions(results);

      expect(suggestions.length).toBe(1);
      // skill name should still be generated
      expect(suggestions[0]!.suggestedSkillName).toBeTruthy();
    });

    it("should handle empty file arrays gracefully", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      const results = {
        "EMPTY.md": [],
      };

      // should not crash and return empty array for empty input
      const suggestions = cache.generateSuggestions(results);

      // empty file arrays should produce no suggestions
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBe(0);
    });
  });

  describe("Cache staleness", () => {
    // helper to create cache with custom timestamp
    const createCacheWithAge = (
      cache: DiscoveryCacheManager,
      ageMs: number,
    ) => {
      const results = { "TEST.md": ["test.md"] };
      cache.save(results);

      // manually update timestamp in cache file
      const cacheFile = path.join(
        TEST_PROJECT_DIR,
        ".claude/cache/discovered-docs.json",
      );
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
        discoveredAt?: string;
      };
      const oldTimestamp = new Date(Date.now() - ageMs).toISOString();
      cacheData.discoveredAt = oldTimestamp;
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    };

    it("should consider cache stale after maxAge", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      // create cache that's 8 days old
      const eightDays = 8 * 24 * 60 * 60 * 1000;
      createCacheWithAge(cache, eightDays);

      // should be stale with 7-day max age
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(cache.isStale(sevenDays)).toBe(true);
    });

    it("should consider cache fresh within maxAge", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      // create cache that's 6 days old
      const sixDays = 6 * 24 * 60 * 60 * 1000;
      createCacheWithAge(cache, sixDays);

      // should be fresh with 7-day max age
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(cache.isStale(sevenDays)).toBe(false);
    });

    it("should use DEFAULT_MAX_AGE when maxAge not provided", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      // create cache that's 8 days old
      const eightDays = 8 * 24 * 60 * 60 * 1000;
      createCacheWithAge(cache, eightDays);

      // should be stale using default (7 days)
      expect(cache.isStale()).toBe(true);
    });

    it("should treat non-existent cache as stale", () => {
      const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

      // no cache exists
      expect(cache.isStale()).toBe(true);
    });

    it("should respect DOC_CACHE_TTL_DAYS env var", () => {
      // set env var to 1 day
      const originalEnv = process.env.DOC_CACHE_TTL_DAYS;
      process.env.DOC_CACHE_TTL_DAYS = "1";

      try {
        // create new cache manager to pick up env var
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create cache that's 2 days old
        const twoDays = 2 * 24 * 60 * 60 * 1000;
        createCacheWithAge(cache, twoDays);

        // should be stale with 1-day TTL from env var
        expect(cache.isStale()).toBe(true);

        // create cache that's 12 hours old
        const halfDay = 12 * 60 * 60 * 1000;
        createCacheWithAge(cache, halfDay);

        // should be fresh with 1-day TTL
        expect(cache.isStale()).toBe(false);
      } finally {
        // restore original env var
        if (originalEnv === undefined) {
          delete process.env.DOC_CACHE_TTL_DAYS;
        } else {
          process.env.DOC_CACHE_TTL_DAYS = originalEnv;
        }
      }
    });

    describe("isFresh()", () => {
      it("should return true when cache is fresh", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create fresh cache (1 hour old)
        const oneHour = 60 * 60 * 1000;
        createCacheWithAge(cache, oneHour);

        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        expect(cache.isFresh(sevenDays)).toBe(true);
      });

      it("should return false when cache is stale", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create stale cache (8 days old)
        const eightDays = 8 * 24 * 60 * 60 * 1000;
        createCacheWithAge(cache, eightDays);

        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        expect(cache.isFresh(sevenDays)).toBe(false);
      });

      it("should return false when cache does not exist", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);
        expect(cache.isFresh()).toBe(false);
      });
    });

    describe("loadIfFresh()", () => {
      it("should return null and clear cache if stale", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create stale cache
        const eightDays = 8 * 24 * 60 * 60 * 1000;
        createCacheWithAge(cache, eightDays);

        const cacheFile = path.join(
          TEST_PROJECT_DIR,
          ".claude/cache/discovered-docs.json",
        );
        expect(fs.existsSync(cacheFile)).toBe(true);

        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const result = cache.loadIfFresh(sevenDays);

        expect(result).toBeNull();
        expect(fs.existsSync(cacheFile)).toBe(false);
      });

      it("should return cache if fresh", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create fresh cache
        const oneDay = 24 * 60 * 60 * 1000;
        createCacheWithAge(cache, oneDay);

        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const result = cache.loadIfFresh(sevenDays);

        expect(result).toBeTruthy();
        expect(result!.version).toBe("1.0");
        expect(result!.exactMatches).toEqual({ "TEST.md": ["test.md"] });
      });

      it("should return null and clear if corrupted", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create corrupted cache
        const cacheDir = path.join(TEST_PROJECT_DIR, ".claude/cache");
        fs.mkdirSync(cacheDir, { recursive: true });
        const cacheFile = path.join(cacheDir, "discovered-docs.json");
        fs.writeFileSync(cacheFile, "{ invalid json }", "utf8");

        expect(fs.existsSync(cacheFile)).toBe(true);

        const result = cache.loadIfFresh();

        expect(result).toBeNull();
        expect(fs.existsSync(cacheFile)).toBe(false);
      });

      it("should clear corrupted cache and return null", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create corrupted cache
        const cacheDir = path.join(TEST_PROJECT_DIR, ".claude/cache");
        fs.mkdirSync(cacheDir, { recursive: true });
        const cacheFile = path.join(cacheDir, "discovered-docs.json");
        fs.writeFileSync(cacheFile, "{ invalid json }", "utf8");

        // the observable behavior: loadIfFresh returns null and clears the file
        const result = cache.loadIfFresh();

        expect(result).toBeNull();
        expect(fs.existsSync(cacheFile)).toBe(false);
      });

      it("should return null when cache does not exist", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);
        const result = cache.loadIfFresh();

        expect(result).toBeNull();
      });
    });

    describe("Boundary conditions", () => {
      it("should treat age === maxAge as stale", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create cache exactly 7 days old
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        createCacheWithAge(cache, sevenDays);

        // should be stale at exactly maxAge
        expect(cache.isStale(sevenDays)).toBe(true);
        expect(cache.isFresh(sevenDays)).toBe(false);
      });

      it("should treat age > maxAge as stale", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        // create cache one millisecond over 7 days
        createCacheWithAge(cache, sevenDays + 1);

        // should be stale
        expect(cache.isStale(sevenDays)).toBe(true);
        expect(cache.isFresh(sevenDays)).toBe(false);
      });

      it("should treat age < maxAge as fresh", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        // create cache 1 second under 7 days (larger margin to avoid timing issues)
        createCacheWithAge(cache, sevenDays - 1000);

        // should be fresh
        expect(cache.isStale(sevenDays)).toBe(false);
        expect(cache.isFresh(sevenDays)).toBe(true);
      });

      it("should handle maxAge = 0 (any aged cache is stale)", () => {
        const cache = new DiscoveryCacheManager(TEST_PROJECT_DIR);

        // create cache 1 second old
        createCacheWithAge(cache, 1000);

        // should be stale with maxAge = 0
        expect(cache.isStale(0)).toBe(true);

        // even a brand new cache with maxAge=0 is immediately stale
        // (maxAge=0 means "always stale" which is a valid use case for forcing re-discovery)
        cache.save({ "TEST.md": ["test.md"] });
        expect(cache.isStale(0)).toBe(true);
      });
    });
  });
});
