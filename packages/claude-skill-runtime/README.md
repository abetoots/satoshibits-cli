# claude-skill-runtime

Runtime library for Claude Code auto-loading skills. Provides shared matching algorithms, config loading, and session state management.

## Overview

This package eliminates code duplication between the CLI (`create-auto-loading-claude-skills`) and scaffolded hook templates. Bug fixes and improvements can be applied via `npm update` without regenerating hooks.

## Installation

```bash
npm install claude-skill-runtime
# or
pnpm add claude-skill-runtime
```

## API Reference

### Config Loading

```typescript
import { ConfigLoader, getLogger } from 'claude-skill-runtime';

const projectDir = '/path/to/project';
const loader = new ConfigLoader(projectDir);
const config = loader.loadSkillRules();
const logger = getLogger(projectDir, config);
```

### Rule Matching

```typescript
import { RuleMatcher } from 'claude-skill-runtime';

const matcher = new RuleMatcher(config, projectRoot);

// Match prompt triggers (optionally include modified files for file-based triggers)
const promptMatches = matcher.matchPrompt('create a new API endpoint', ['/src/api/users.ts']);

// Match shadow triggers (suggestions without auto-loading)
const shadowMatches = matcher.matchShadowTriggers('still failing after many attempts');

// Match pre-tool triggers (before tool execution)
const preToolMatches = matcher.matchPreToolTriggers('Bash', 'git commit -m "fix"');

// Match stop triggers (when Claude completes work)
const stopMatches = matcher.matchStopTriggers('I have fixed the bug');
```

### Session State

```typescript
import { sessionState } from 'claude-skill-runtime';

const sessionId = 'my-session-id';

// Track modified files
sessionState.addModifiedFile(sessionId, '/src/api/users.ts');

// Track activated skills
sessionState.recordSkillActivation(sessionId, 'backend-dev-guidelines');

// Get session data
const files = sessionState.getModifiedFiles(sessionId);
const skills = sessionState.getActivatedSkills(sessionId);
```

### Shadow Triggers

```typescript
import { convertMatchesToSuggestions, formatShadowSuggestions } from 'claude-skill-runtime';

// Convert matches to user-facing suggestions
const suggestions = convertMatchesToSuggestions(shadowMatches);

// Format for output
const formatted = formatShadowSuggestions(suggestions);
```

### Path Utilities

```typescript
import { normalizeFilePath, normalizeFilePaths, resolveFilePath } from 'claude-skill-runtime';

const normalized = normalizeFilePath('/path/to/file.ts', projectRoot);
const resolved = resolveFilePath('src/api/users.ts', projectRoot);
```

### Debug Logging

```typescript
import { createLogger, createNoopLogger } from 'claude-skill-runtime';

const logger = createLogger('/path/to/project', true, ['activation', 'scoring']);

logger.log('activation', 'Skill matched', { skillName: 'backend-dev' });
```

### Hook Utilities

Shared utilities for hook templates - eliminates code duplication across hooks.

```typescript
import {
  readStdin,
  initHookContext,
  handleHookError,
  type HookContext,
} from 'claude-skill-runtime';

// Read JSON input from stdin
const input = await readStdin();
const data = JSON.parse(input);

// Initialize standard hook context (projectDir, config, logger)
const { projectDir, configLoader, config, logger } = initHookContext({
  workingDirectory: data.working_directory,
});

// Handle errors consistently across hooks
try {
  // ... hook logic
} catch (error) {
  handleHookError(error, logger, { hookName: 'PreToolUse', debugOutput: true });
  process.exit(0);
}
```

### Pattern Utilities

Shared utilities for regex pattern handling.

```typescript
import {
  extractPatternFields,
  extractValidationRulePatterns,
  validatePattern,
} from 'claude-skill-runtime';

// Extract all pattern fields from a skill rule
for (const { fieldPath, patterns } of extractPatternFields(rule)) {
  for (const pattern of patterns) {
    const error = validatePattern(pattern, 'i');
    if (error) console.error(`Invalid pattern in ${fieldPath}: ${error}`);
  }
}

// Extract patterns from validation rules
for (const { fieldPath, patterns, flags } of extractValidationRulePatterns(rule.validationRules)) {
  // ...
}
```

### Config Factory

```typescript
import { createDefaultConfig } from 'claude-skill-runtime';

// Create a new default config structure
const config = createDefaultConfig();
```

### Pattern Validation

```typescript
import { validateRegexPatterns } from 'claude-skill-runtime';

const errors = validateRegexPatterns(config);
if (errors.length > 0) {
  console.error('Invalid patterns:', errors);
}
```

## Types

```typescript
import type {
  // Core types
  SkillRule,
  ValidationRule,
  SkillConfig,
  SkillMatch,
  ShadowMatch,
  PreToolMatch,
  StopMatch,
  ShadowSuggestion,
  SessionData,
  LogCategory,
  DebugLogger,
  // Hook utilities
  HookContext,
  InitHookContextOptions,
  HandleHookErrorOptions,
  // Pattern utilities
  PatternField,
  ValidationRulePatternField,
  // Hook output types
  GuaranteedSkillInfo,
  HookShadowSuggestion,
  UserPromptSubmitOutput,
  PreToolUseOutput,
  PostToolUseOutput,
  StopHookOutput,
} from 'claude-skill-runtime';
```

## Architecture

This library is designed for **stateless hook execution**. Per Claude Code's hook architecture:

- Hooks are one-way output pipelines (stdin JSON -> processing -> stdout JSON)
- Hooks cannot receive user feedback or track preferences across prompts
- Session state persists to disk for cross-process continuity

The library provides deterministic pattern matching while respecting these constraints.

## License

MIT
