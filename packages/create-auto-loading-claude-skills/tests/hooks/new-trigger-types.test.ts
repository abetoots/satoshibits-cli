import {
  RuleMatcher,
  convertMatchesToSuggestions,
  formatShadowSuggestions,
  type SkillConfig,
} from '../../src/helpers/internal/index.js';

describe('Shadow Triggers', () => {
  let config: SkillConfig;
  let matcher: RuleMatcher;

  beforeEach(() => {
    config = {
      version: '1.0',
      description: 'Test config',
      settings: {
        scoring: {
          keywordMatchScore: 10,
          intentPatternScore: 20,
        },
      },
      skills: {
        'systematic-debugging': {
          type: 'workflow',
          enforcement: 'manual',
          priority: 'medium',
          description: 'Structured debugging methodology',
          shadowTriggers: {
            keywords: ['still failing', 'tried everything', 'makes no sense'],
            intentPatterns: ['error.*?persists', 'same.*?(issue|problem)'],
          },
        },
        'auto-load-skill': {
          type: 'domain',
          enforcement: 'suggest',
          priority: 'high',
          description: 'Auto-loading skill',
          promptTriggers: {
            keywords: ['typescript'],
          },
        },
      },
    };

    matcher = new RuleMatcher(config, '/tmp/test-project');
  });

  it('should match shadow trigger keywords', () => {
    const matches = matcher.matchShadowTriggers('The test is still failing after many attempts');

    expect(matches.length).toBe(1);
    expect(matches[0]!.skillName).toBe('systematic-debugging');
    // score should be at least keywordMatchScore (10) from config
    expect(matches[0]!.score).toBeGreaterThanOrEqual(10);
    expect(matches[0]!.reason).toContain('still failing');
  });

  it('should match shadow trigger intent patterns', () => {
    const matches = matcher.matchShadowTriggers('This error persists no matter what I try');

    expect(matches.length).toBe(1);
    expect(matches[0]!.skillName).toBe('systematic-debugging');
    expect(matches[0]!.score >= 20).toBe(true); // intent pattern score
  });

  it('should not match regular prompt triggers as shadow triggers', () => {
    const matches = matcher.matchShadowTriggers('I need help with typescript');

    // auto-load-skill has promptTriggers but not shadowTriggers
    // so it should not appear in shadow matches
    const autoLoadMatch = matches.find((m) => m.skillName === 'auto-load-skill');
    expect(autoLoadMatch).toBeUndefined();
  });

  it('should convert shadow matches to suggestions', () => {
    const matches = matcher.matchShadowTriggers('still failing');
    const suggestions = convertMatchesToSuggestions(matches);

    expect(suggestions.length).toBe(1);
    expect(suggestions[0]!.skillName).toBe('systematic-debugging');
    expect(suggestions[0]!.description).toBe('Structured debugging methodology');
  });

  it('should format shadow suggestions for output', () => {
    const matches = matcher.matchShadowTriggers('still failing');
    const suggestions = convertMatchesToSuggestions(matches);
    const formatted = formatShadowSuggestions(suggestions);

    expect(formatted.includes('Related Skills')).toBe(true);
    expect(formatted.includes('systematic-debugging')).toBe(true);
    expect(formatted.includes('Structured debugging methodology')).toBe(true);
  });
});

describe('Pre-Tool Triggers', () => {
  let config: SkillConfig;
  let matcher: RuleMatcher;

  beforeEach(() => {
    config = {
      version: '1.0',
      description: 'Test config',
      skills: {
        'pre-commit-checklist': {
          type: 'guardrail',
          enforcement: 'warn',
          priority: 'high',
          description: 'Verify before committing',
          preToolTriggers: {
            toolName: 'Bash',
            inputPatterns: ['git commit', 'git push'],
          },
        },
        'sql-safety': {
          type: 'guardrail',
          enforcement: 'block',
          priority: 'critical',
          description: 'SQL injection prevention',
          preToolTriggers: {
            toolName: 'Bash',
            inputPatterns: ['psql', 'mysql', 'sqlite3'],
          },
        },
        'any-bash': {
          type: 'guardrail',
          enforcement: 'suggest',
          priority: 'low',
          description: 'General bash guardrail',
          preToolTriggers: {
            toolName: 'Bash',
            // no inputPatterns - matches any Bash tool use
          },
        },
      },
    };

    matcher = new RuleMatcher(config, '/tmp/test-project');
  });

  it('should match pre-tool triggers with input patterns', () => {
    const matches = matcher.matchPreToolTriggers('Bash', 'git commit -m "fix bug"');

    expect(matches.length).toBe(2); // pre-commit-checklist and any-bash
    const preCommit = matches.find((m) => m.skillName === 'pre-commit-checklist');
    expect(preCommit).toBeTruthy();
    expect(preCommit!.toolName).toBe('Bash');
    expect(preCommit!.matchedPattern).toBe('git commit');
  });

  it('should match tool name only when no input patterns specified', () => {
    const matches = matcher.matchPreToolTriggers('Bash', 'ls -la');

    // only any-bash should match (no specific input pattern)
    const anyBash = matches.find((m) => m.skillName === 'any-bash');
    expect(anyBash).toBeTruthy();
    expect(anyBash!.matchedPattern).toBeUndefined();

    // pre-commit-checklist should not match
    const preCommit = matches.find((m) => m.skillName === 'pre-commit-checklist');
    expect(preCommit).toBeUndefined();
  });

  it('should not match different tool names', () => {
    const matches = matcher.matchPreToolTriggers('Write', 'some content');

    // no skills have Write as toolName
    expect(matches.length).toBe(0);
  });

  it('should match multiple skills for same tool', () => {
    const matches = matcher.matchPreToolTriggers('Bash', 'psql -c "SELECT * FROM users"');

    // should match sql-safety (psql pattern) and any-bash (no pattern required)
    expect(matches.length).toBe(2);
    const sqlSafety = matches.find((m) => m.skillName === 'sql-safety');
    expect(sqlSafety).toBeTruthy();
    expect(sqlSafety!.matchedPattern).toBe('psql');
  });
});

describe('Stop Triggers', () => {
  let config: SkillConfig;
  let matcher: RuleMatcher;

  beforeEach(() => {
    config = {
      version: '1.0',
      description: 'Test config',
      skills: {
        'verification-before-completion': {
          type: 'guardrail',
          enforcement: 'suggest',
          priority: 'high',
          description: 'Verify work is complete',
          stopTriggers: {
            keywords: ['done', 'complete', 'fixed', 'finished'],
            promptEvaluation: 'Evaluate if work is actually complete',
          },
        },
        'keyword-only-stop': {
          type: 'guardrail',
          enforcement: 'suggest',
          priority: 'medium',
          description: 'Simple keyword stop trigger',
          stopTriggers: {
            keywords: ['shipped', 'deployed'],
          },
        },
        'prompt-only-stop': {
          type: 'guardrail',
          enforcement: 'suggest',
          priority: 'medium',
          description: 'Prompt evaluation only',
          stopTriggers: {
            promptEvaluation: 'Check if ready for production',
          },
        },
      },
    };

    matcher = new RuleMatcher(config, '/tmp/test-project');
  });

  it('should match stop trigger keywords', () => {
    const matches = matcher.matchStopTriggers("I've fixed the bug and the tests are passing now!");

    const verification = matches.find(
      (m) => m.skillName === 'verification-before-completion'
    );
    expect(verification).toBeTruthy();
    expect(verification!.matchedKeyword).toBe('fixed');
    expect(verification!.requiresPromptEvaluation).toBe(true);
  });

  it('should match keyword-only stop triggers', () => {
    const matches = matcher.matchStopTriggers('The feature has been shipped to production');

    const keywordOnly = matches.find((m) => m.skillName === 'keyword-only-stop');
    expect(keywordOnly).toBeTruthy();
    expect(keywordOnly!.matchedKeyword).toBe('shipped');
    expect(keywordOnly!.requiresPromptEvaluation).toBe(false);
  });

  it('should match prompt-evaluation-only stop triggers', () => {
    const matches = matcher.matchStopTriggers('Everything is ready for production');

    // prompt-only-stop has promptEvaluation but no keywords
    // should trigger because promptEvaluation is defined
    const promptOnly = matches.find((m) => m.skillName === 'prompt-only-stop');
    expect(promptOnly).toBeTruthy();
    expect(promptOnly!.matchedKeyword).toBeUndefined();
    expect(promptOnly!.requiresPromptEvaluation).toBe(true);
  });

  it('should not match when no keywords present and no prompt evaluation', () => {
    // add a skill with no stop triggers
    config.skills['no-stop-triggers'] = {
      type: 'domain',
      enforcement: 'suggest',
      priority: 'medium',
      description: 'No stop triggers',
    };

    matcher = new RuleMatcher(config, '/tmp/test-project');
    const matches = matcher.matchStopTriggers('I am done with everything');

    // should not include the skill without stop triggers
    const noStopTriggers = matches.find((m) => m.skillName === 'no-stop-triggers');
    expect(noStopTriggers).toBeUndefined();
  });

  it('should be case insensitive for keyword matching', () => {
    const matches = matcher.matchStopTriggers('DONE! The feature is COMPLETE!');

    const verification = matches.find(
      (m) => m.skillName === 'verification-before-completion'
    );
    expect(verification).toBeTruthy();
    // should match either 'done' or 'complete' (case-insensitive matching)
    expect(['done', 'complete']).toContain(verification!.matchedKeyword!.toLowerCase());
  });
});

describe('Manual-only Skills', () => {
  it('should not include manual-only skills in prompt matching', () => {
    const config: SkillConfig = {
      version: '1.0',
      description: 'Test config',
      skills: {
        'auto-skill': {
          type: 'domain',
          enforcement: 'suggest',
          priority: 'high',
          description: 'Auto-loading skill',
          promptTriggers: {
            keywords: ['test-keyword'],
          },
        },
        'manual-skill': {
          type: 'workflow',
          enforcement: 'manual',
          priority: 'high',
          description: 'Manual-only skill',
          promptTriggers: {
            keywords: ['test-keyword'],
          },
        },
      },
    };

    const matcher = new RuleMatcher(config, '/tmp/test-project');
    const matches = matcher.matchPrompt('I need help with test-keyword');

    // should only include auto-skill, not manual-skill
    expect(matches.length).toBe(1);
    expect(matches[0]!.skillName).toBe('auto-skill');
  });
});
