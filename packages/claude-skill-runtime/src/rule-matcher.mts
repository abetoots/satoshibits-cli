/**
 * Rule Matcher - matches prompts and files against skill rules
 * Core matching algorithms for auto-loading, shadow triggers, and validation
 */

import { minimatch } from "minimatch";
import fs from "fs";
import path from "path";

import type {
  DebugLogger,
  PreToolMatch,
  ShadowMatch,
  SkillConfig,
  SkillMatch,
  SkillRule,
  StopMatch,
  ValidationRule,
} from "./types.mjs";

import { resolveFilePath } from "./path-utils.mjs";

/**
 * Match prompts and files against skill rules
 */
export class RuleMatcher {
  private config: SkillConfig;
  private projectDir: string;
  private logger: DebugLogger | null;
  private compiledPatterns: Map<
    string,
    {
      intentPatterns?: RegExp[];
      contentPatterns?: RegExp[];
      shadowIntentPatterns?: RegExp[];
      preToolInputPatterns?: RegExp[];
    }
  >;

  constructor(config: SkillConfig, projectDir: string, logger?: DebugLogger) {
    this.config = config;
    this.projectDir = projectDir;
    this.logger = logger ?? null;
    this.compiledPatterns = this.precompileRegexPatterns();
  }

  /**
   * Compile an array of regex pattern strings into RegExp objects
   * Gracefully handles malformed patterns by logging errors and skipping them
   */
  private compilePatterns(
    patterns: string[] | undefined,
    skillName: string,
    patternType: string
  ): RegExp[] | undefined {
    if (!patterns || patterns.length === 0) {
      return undefined;
    }

    const compiled: RegExp[] = [];
    for (const pattern of patterns) {
      try {
        compiled.push(new RegExp(pattern, "i"));
      } catch (error) {
        this.logger?.log("error", `invalid regex in ${patternType}`, {
          skill: skillName,
          pattern,
          error: error instanceof Error ? error.message : String(error),
        });
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Invalid regex in skill '${skillName}' ${patternType}: ${pattern}`
          );
        }
      }
    }

    return compiled.length > 0 ? compiled : undefined;
  }

  /**
   * Pre-compile all regex patterns for performance
   * Gracefully handles malformed patterns
   */
  private precompileRegexPatterns(): Map<
    string,
    {
      intentPatterns?: RegExp[];
      contentPatterns?: RegExp[];
      shadowIntentPatterns?: RegExp[];
      preToolInputPatterns?: RegExp[];
    }
  > {
    const compiled = new Map<
      string,
      {
        intentPatterns?: RegExp[];
        contentPatterns?: RegExp[];
        shadowIntentPatterns?: RegExp[];
        preToolInputPatterns?: RegExp[];
      }
    >();

    // handle missing/null skills object
    if (!this.config.skills || typeof this.config.skills !== "object") {
      return compiled;
    }

    for (const [skillName, rule] of Object.entries(this.config.skills)) {
      const patterns: {
        intentPatterns?: RegExp[];
        contentPatterns?: RegExp[];
        shadowIntentPatterns?: RegExp[];
        preToolInputPatterns?: RegExp[];
      } = {};

      // compile all pattern types using helper
      patterns.intentPatterns = this.compilePatterns(
        rule.promptTriggers?.intentPatterns,
        skillName,
        "intentPattern"
      );

      patterns.contentPatterns = this.compilePatterns(
        rule.fileTriggers?.contentPatterns,
        skillName,
        "contentPattern"
      );

      patterns.shadowIntentPatterns = this.compilePatterns(
        rule.shadowTriggers?.intentPatterns,
        skillName,
        "shadowIntentPattern"
      );

      patterns.preToolInputPatterns = this.compilePatterns(
        rule.preToolTriggers?.inputPatterns,
        skillName,
        "preToolInputPattern"
      );

      if (
        patterns.intentPatterns ||
        patterns.contentPatterns ||
        patterns.shadowIntentPatterns ||
        patterns.preToolInputPatterns
      ) {
        compiled.set(skillName, patterns);
      }
    }

    return compiled;
  }

  /**
   * Match prompt against all skill rules
   */
  matchPrompt(prompt: string, modifiedFiles: string[] = []): SkillMatch[] {
    const matches: SkillMatch[] = [];

    // handle missing/null skills object
    if (!this.config.skills || typeof this.config.skills !== "object") {
      this.logger?.log("scoring", "no skills configured");
      return matches;
    }

    for (const [skillName, rule] of Object.entries(this.config.skills)) {
      // skip manual-only skills for auto-loading
      if (rule.enforcement === "manual") {
        continue;
      }

      const promptScore = this.calculatePromptScore(prompt, rule, skillName);
      const fileScore = this.calculateFileScore(modifiedFiles, rule, skillName);

      if (promptScore > 0 || fileScore > 0) {
        const totalScore = promptScore + fileScore;
        this.logger?.log("scoring", "skill matched", {
          skill: skillName,
          promptScore,
          fileScore,
          totalScore,
          priority: rule.priority,
        });
        matches.push({
          skillName,
          rule,
          score: totalScore,
          promptMatch: promptScore > 0,
          fileMatch: fileScore > 0,
        });
      }
    }

    this.logger?.log("scoring", "matching complete", {
      totalMatches: matches.length,
      skills: matches.map((m) => m.skillName),
    });

    // sort by priority then score
    return this.sortMatches(matches);
  }

  /**
   * Match prompt against shadow triggers
   * Returns suggestions for MANUAL-ONLY skills that might be relevant
   */
  matchShadowTriggers(prompt: string): ShadowMatch[] {
    const matches: ShadowMatch[] = [];

    if (!this.config.skills || typeof this.config.skills !== "object") {
      return matches;
    }

    const promptLower = prompt.toLowerCase();
    const keywordScore = this.config.settings?.scoring?.keywordMatchScore ?? 10;
    const intentScore = this.config.settings?.scoring?.intentPatternScore ?? 20;

    for (const [skillName, rule] of Object.entries(this.config.skills)) {
      // only process skills with shadow triggers
      if (!rule.shadowTriggers) {
        continue;
      }

      let score = 0;
      let reason = "";

      // keyword matching
      if (rule.shadowTriggers.keywords) {
        for (const keyword of rule.shadowTriggers.keywords) {
          if (promptLower.includes(keyword.toLowerCase())) {
            score += keywordScore;
            reason = `Detected: "${keyword}"`;
            this.logger?.log("scoring", "shadow keyword match", {
              skill: skillName,
              keyword,
              points: keywordScore,
            });
            break;
          }
        }
      }

      // intent pattern matching
      const compiledPatterns =
        this.compiledPatterns.get(skillName)?.shadowIntentPatterns ?? [];
      for (const pattern of compiledPatterns) {
        if (pattern.test(prompt)) {
          score += intentScore;
          if (!reason) {
            reason = `Pattern matched: ${pattern.source}`;
          }
          this.logger?.log("scoring", "shadow intent match", {
            skill: skillName,
            pattern: pattern.source,
            points: intentScore,
          });
          break;
        }
      }

      if (score > 0) {
        matches.push({
          skillName,
          rule,
          score,
          reason,
        });
      }
    }

    // sort by score descending
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Match tool usage against pre-tool triggers
   * Returns skills that should be loaded/suggested before tool execution
   */
  matchPreToolTriggers(toolName: string, toolInput: string): PreToolMatch[] {
    const matches: PreToolMatch[] = [];

    if (!this.config.skills || typeof this.config.skills !== "object") {
      return matches;
    }

    for (const [skillName, rule] of Object.entries(this.config.skills)) {
      if (!rule.preToolTriggers) {
        continue;
      }

      // check tool name match
      if (rule.preToolTriggers.toolName !== toolName) {
        continue;
      }

      // if no input patterns, just tool name match is enough
      if (
        !rule.preToolTriggers.inputPatterns ||
        rule.preToolTriggers.inputPatterns.length === 0
      ) {
        this.logger?.log("activation", "pre-tool match (tool name only)", {
          skill: skillName,
          toolName,
        });
        matches.push({
          skillName,
          rule,
          toolName,
        });
        continue;
      }

      // check input patterns
      const compiledPatterns =
        this.compiledPatterns.get(skillName)?.preToolInputPatterns ?? [];
      for (const pattern of compiledPatterns) {
        if (pattern.test(toolInput)) {
          this.logger?.log("activation", "pre-tool match", {
            skill: skillName,
            toolName,
            pattern: pattern.source,
          });
          matches.push({
            skillName,
            rule,
            toolName,
            matchedPattern: pattern.source,
          });
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Match Claude's response against stop triggers
   * Returns skills that should be loaded when Claude claims completion
   */
  matchStopTriggers(claudeResponse: string): StopMatch[] {
    const matches: StopMatch[] = [];

    if (!this.config.skills || typeof this.config.skills !== "object") {
      return matches;
    }

    const responseLower = claudeResponse.toLowerCase();

    for (const [skillName, rule] of Object.entries(this.config.skills)) {
      if (!rule.stopTriggers) {
        continue;
      }

      let matched = false;
      let matchedKeyword: string | undefined;

      // keyword matching
      if (rule.stopTriggers.keywords) {
        for (const keyword of rule.stopTriggers.keywords) {
          if (responseLower.includes(keyword.toLowerCase())) {
            matched = true;
            matchedKeyword = keyword;
            this.logger?.log("activation", "stop trigger keyword match", {
              skill: skillName,
              keyword,
            });
            break;
          }
        }
      }

      // if keywords matched or there's a prompt evaluation
      if (matched || rule.stopTriggers.promptEvaluation) {
        matches.push({
          skillName,
          rule,
          matchedKeyword,
          requiresPromptEvaluation: !!rule.stopTriggers.promptEvaluation,
        });
      }
    }

    return matches;
  }

  /**
   * Calculate match score for prompt triggers
   */
  private calculatePromptScore(
    prompt: string,
    rule: SkillRule,
    skillName: string,
  ): number {
    let score = 0;
    const promptLower = prompt.toLowerCase();

    // get scoring weights from config
    const keywordScore = this.config.settings?.scoring?.keywordMatchScore ?? 10;
    const intentScore = this.config.settings?.scoring?.intentPatternScore ?? 20;

    // keyword matching (fast path)
    if (rule.promptTriggers?.keywords) {
      for (const keyword of rule.promptTriggers.keywords) {
        if (promptLower.includes(keyword.toLowerCase())) {
          this.logger?.log("scoring", "keyword match", {
            skill: skillName,
            keyword,
            points: keywordScore,
          });
          score += keywordScore;
          break; // only count one keyword match
        }
      }
    }

    // intent pattern matching (regex)
    if (rule.promptTriggers?.intentPatterns) {
      const compiledPatterns =
        this.compiledPatterns.get(skillName)?.intentPatterns ?? [];
      for (const pattern of compiledPatterns) {
        if (pattern.test(prompt)) {
          this.logger?.log("scoring", "intent pattern match", {
            skill: skillName,
            pattern: pattern.source,
            points: intentScore,
          });
          score += intentScore; // intent patterns are stronger signals
          break;
        }
      }
    }

    return score;
  }

  /**
   * Calculate match score for file triggers
   *
   * When contentPatterns are specified, files must match BOTH path AND content
   * to contribute to the score. This ensures skills only activate when the
   * file content is actually relevant (e.g., Express-specific guidelines only
   * activate when file actually uses Express, not just because it's in src/api/).
   */
  private calculateFileScore(
    modifiedFiles: string[],
    rule: SkillRule,
    skillName: string,
  ): number {
    if (!rule.fileTriggers) return 0;

    // get scoring weights from config
    const pathScore = this.config.settings?.scoring?.filePathMatchScore ?? 15;
    const contentScore =
      this.config.settings?.scoring?.fileContentMatchScore ?? 15;

    const hasContentPatterns =
      rule.fileTriggers.contentPatterns &&
      rule.fileTriggers.contentPatterns.length > 0;
    const compiledPatterns =
      this.compiledPatterns.get(skillName)?.contentPatterns ?? [];

    // when contentPatterns are specified, require BOTH path AND content match
    if (hasContentPatterns && rule.fileTriggers.pathPatterns) {
      for (const filePath of modifiedFiles) {
        // check path match first
        let pathMatches = false;
        for (const pattern of rule.fileTriggers.pathPatterns) {
          if (minimatch(filePath, pattern)) {
            pathMatches = true;
            break;
          }
        }

        if (!pathMatches) continue;

        // path matched, now check content
        const absolutePath = resolveFilePath(filePath, this.projectDir);
        if (!fs.existsSync(absolutePath)) continue;

        try {
          // skip files larger than 1MB to avoid memory issues
          const stats = fs.statSync(absolutePath);
          if (stats.size > 1024 * 1024) continue;

          const content = fs.readFileSync(absolutePath, "utf8");

          for (const pattern of compiledPatterns) {
            if (pattern.test(content)) {
              // both path AND content match - award both scores
              this.logger?.log("scoring", "path+content match", {
                skill: skillName,
                filePath,
                points: pathScore + contentScore,
              });
              return pathScore + contentScore;
            }
          }
        } catch {
          // skip files that can't be read
          continue;
        }
      }

      // path matched but content didn't - no score when contentPatterns required
      return 0;
    }

    // no contentPatterns specified - use original additive logic
    let score = 0;

    // path pattern matching
    if (rule.fileTriggers.pathPatterns) {
      for (const filePath of modifiedFiles) {
        for (const pattern of rule.fileTriggers.pathPatterns) {
          if (minimatch(filePath, pattern)) {
            this.logger?.log("scoring", "path match", {
              skill: skillName,
              filePath,
              pattern,
              points: pathScore,
            });
            score += pathScore;
            break;
          }
        }
        if (score > 0) break; // only count one file match
      }
    }

    // content pattern matching (only if no pathPatterns, or as standalone)
    if (hasContentPatterns && !rule.fileTriggers.pathPatterns) {
      for (const filePath of modifiedFiles) {
        const absolutePath = resolveFilePath(filePath, this.projectDir);

        if (!fs.existsSync(absolutePath)) continue;

        try {
          const content = fs.readFileSync(absolutePath, "utf8");

          for (const pattern of compiledPatterns) {
            if (pattern.test(content)) {
              this.logger?.log("scoring", "content match", {
                skill: skillName,
                filePath,
                points: contentScore,
              });
              score += contentScore;
              break;
            }
          }

          if (score > 0) break; // only count one file match
        } catch {
          continue;
        }
      }
    }

    return score;
  }

  /**
   * Sort matches by priority and score
   */
  private sortMatches(matches: SkillMatch[]): SkillMatch[] {
    const priorityOrder = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    } as const;

    return matches.sort((a, b) => {
      const priorityA = priorityOrder[a.rule.priority] ?? 0;
      const priorityB = priorityOrder[b.rule.priority] ?? 0;
      const priorityDiff = priorityB - priorityA;
      if (priorityDiff !== 0) return priorityDiff;
      return b.score - a.score;
    });
  }

  /**
   * Filter matches by max suggestions limit
   */
  limitMatches(matches: SkillMatch[], maxSuggestions: number): SkillMatch[] {
    // always include critical matches
    const critical = matches.filter((m) => m.rule.priority === "critical");
    const others = matches.filter((m) => m.rule.priority !== "critical");

    const remaining = maxSuggestions - critical.length;
    return [...critical, ...others.slice(0, remaining)];
  }

  /**
   * Apply validation rules to modified files
   */
  applyValidationRules(
    modifiedFiles: string[],
    activatedSkills: string[],
  ): {
    skillName: string;
    ruleName: string;
    reminder: string;
    failedFiles: string[];
  }[] {
    const reminders: {
      skillName: string;
      ruleName: string;
      reminder: string;
      failedFiles: string[];
    }[] = [];

    for (const skillName of activatedSkills) {
      const rule = this.config.skills[skillName];
      if (!rule?.validationRules) continue;

      this.logger?.log("validation", "checking skill validation rules", {
        skill: skillName,
        ruleCount: rule.validationRules.length,
      });

      for (const validationRule of rule.validationRules) {
        const failures = this.checkValidationRule(
          validationRule,
          modifiedFiles,
        );
        if (failures.length > 0) {
          this.logger?.log("validation", "rule failed", {
            skill: skillName,
            rule: validationRule.name,
            failedFileCount: failures.length,
            failedFiles: failures,
          });
          reminders.push({
            skillName,
            ruleName: validationRule.name,
            reminder: validationRule.reminder,
            failedFiles: failures,
          });
        } else {
          this.logger?.log("validation", "rule passed", {
            skill: skillName,
            rule: validationRule.name,
          });
        }
      }
    }

    // sort reminders by skill priority (critical first)
    const priorityOrder = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    } as const;

    reminders.sort((a, b) => {
      const priorityA = this.config.skills[a.skillName]?.priority ?? "medium";
      const priorityB = this.config.skills[b.skillName]?.priority ?? "medium";
      const scoreA = priorityOrder[priorityA] ?? 0;
      const scoreB = priorityOrder[priorityB] ?? 0;
      return scoreB - scoreA;
    });

    return reminders;
  }

  /**
   * Check a single validation rule against modified files
   */
  private checkValidationRule(
    rule: ValidationRule,
    modifiedFiles: string[],
  ): string[] {
    const failures: string[] = [];

    for (const filePath of modifiedFiles) {
      const absolutePath = resolveFilePath(filePath, this.projectDir);
      if (!fs.existsSync(absolutePath)) continue;

      // check if condition matches
      const conditionMatches = this.checkCondition(
        rule.condition,
        filePath,
        absolutePath,
      );
      if (!conditionMatches) continue;

      // check if requirement is met
      const requirementMet = this.checkRequirement(
        rule.requirement,
        filePath,
        absolutePath,
      );
      if (!requirementMet) {
        failures.push(filePath);
      }
    }

    return failures;
  }

  /**
   * Check if condition matches for a file
   */
  private checkCondition(
    condition: ValidationRule["condition"],
    filePath: string,
    absolutePath: string,
  ): boolean {
    // check path pattern (use relative path for pattern matching)
    if (condition.pathPattern) {
      try {
        const pathRegex = new RegExp(condition.pathPattern);
        if (!pathRegex.test(filePath)) return false;
      } catch {
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Invalid regex in validation condition pathPattern: ${condition.pathPattern}`,
          );
        }
        return false; // invalid pattern = no match
      }
    }

    // check content pattern (use absolute path for reading)
    if (condition.pattern) {
      try {
        const content = fs.readFileSync(absolutePath, "utf8");
        const contentRegex = new RegExp(condition.pattern, "i");
        if (!contentRegex.test(content)) return false;
      } catch {
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Invalid regex in validation condition pattern: ${condition.pattern}`,
          );
        }
        return false; // invalid pattern = no match
      }
    }

    return true;
  }

  /**
   * Check if requirement is met for a file
   */
  private checkRequirement(
    requirement: ValidationRule["requirement"],
    filePath: string,
    absolutePath: string,
  ): boolean {
    // check content pattern requirement (use absolute path for reading)
    if (requirement.pattern) {
      try {
        const content = fs.readFileSync(absolutePath, "utf8");
        const requirementRegex = new RegExp(requirement.pattern, "i");
        return requirementRegex.test(content);
      } catch {
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Invalid regex in validation requirement pattern: ${requirement.pattern}`,
          );
        }
        return false; // invalid pattern = requirement not met
      }
    }

    // check file existence requirement (use absolute path for resolution)
    if (requirement.fileExists) {
      try {
        const dir = path.dirname(absolutePath);
        const filename = path.basename(filePath, path.extname(filePath));
        const requiredFile = requirement.fileExists.replace(
          "${filename}",
          filename,
        );
        const fullPath = path.join(dir, requiredFile);
        return fs.existsSync(fullPath);
      } catch {
        if (process.env.DEBUG) {
          console.warn(
            `⚠️  Error checking file existence: ${requirement.fileExists}`,
          );
        }
        return false;
      }
    }

    return true;
  }
}
