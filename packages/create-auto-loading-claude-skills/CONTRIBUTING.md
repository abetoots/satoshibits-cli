# Contributing to Auto-Loading Claude Skills

Thank you for your interest in contributing! This guide provides everything you need to understand the system architecture, development workflow, and contribution process.

## Development Setup

### Prerequisites

- Node.js 18+ (required for `--experimental-strip-types`)
- pnpm (recommended) or npm
- TypeScript knowledge
- Familiarity with Claude Code and its hooks system

### Local Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/create-auto-loading-claude-skills.git
cd create-auto-loading-claude-skills
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Build the project**

```bash
pnpm build
```

4. **Link for local testing**

```bash
pnpm link --global
```

5. **Test the CLI**

```bash
cd /path/to/test-project
create-auto-loading-claude-skills init
```

### Running TypeScript Checks

```bash
# Type check without emitting
npx tsc --noEmit

# Watch mode for development
npx tsc --noEmit --watch
```

## Architecture Overview

### High-Level Design

The system has two main components:

1. **Scaffolding CLI** (`src/commands/*.ts`) - Generates project structure and templates
2. **Runtime Hooks** (`src/templates/hooks/*.ts`) - Executes during Claude Code lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERACTION                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  UserPromptSubmit Hook      │
         │  (skill-activation-prompt)   │
         └─────────────┬───────────────┘
                       │
                       │ Injects skill suggestions
                       ▼
         ┌─────────────────────────────┐
         │    Claude Processes          │
         │    User Request              │
         └─────────────┬───────────────┘
                       │
                       │ Uses tools (Edit, Write)
                       ▼
         ┌─────────────────────────────┐
         │   PostToolUse Hook           │
         │   (post-tool-use-tracker)    │
         └─────────────┬───────────────┘
                       │
                       │ Tracks modified files
                       ▼
         ┌─────────────────────────────┐
         │   Claude Responds            │
         └─────────────┬───────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   Stop Hook                  │
         │   (stop-validator) │
         └─────────────┬───────────────┘
                       │
                       │ Validates quality
                       ▼
         ┌─────────────────────────────┐
         │   Return to User             │
         └─────────────────────────────┘
```

### Feedback Loop Architecture

The system implements a **BEFORE → DURING → AFTER** feedback loop:

1. **BEFORE (UserPromptSubmit)**

   - Analyzes prompt + file context
   - Matches against skill rules
   - Injects suggestions into Claude's context

2. **DURING (PostToolUse)**

   - Tracks file modifications
   - Normalizes and persists paths
   - Builds session context

3. **AFTER (Stop)**
   - Validates against activated skills
   - Checks for risky patterns
   - Displays reminders

Critical insight: **Session state must persist across separate Node.js processes**. Each hook invocation is a new process, so state lives in `.claude/cache/session-<id>.json`.

## Code Organization

```
create-auto-loading-claude-skills/
├── src/
│   ├── commands/              # CLI command implementations
│   │   ├── init.ts           # Initialize project structure
│   │   ├── add-skill.ts      # Add new skill template
│   │   ├── validate.ts       # Validate configuration
│   │   └── upgrade.ts        # Upgrade existing installations
│   │
│   ├── templates/             # Files copied to user projects
│   │   ├── hooks/            # Hook implementations (the runtime)
│   │   │   ├── lib/          # Shared libraries
│   │   │   │   ├── config-loader.ts      # Load/parse skill-rules.yaml
│   │   │   │   ├── rule-matcher.ts       # Pattern matching engine
│   │   │   │   ├── session-state.ts      # Session persistence
│   │   │   │   └── path-utils.ts         # Path normalization
│   │   │   │
│   │   │   ├── skill-activation-prompt.ts    # UserPromptSubmit hook
│   │   │   ├── post-tool-use-tracker.ts      # PostToolUse hook
│   │   │   └── stop-validator.ts   # Stop hook
│   │   │
│   │   ├── skill-template/   # Boilerplate for new skills
│   │   │   └── SKILL.md
│   │   │
│   │   └── skill-rules.yaml  # Default configuration template
│   │
│   └── utils/                # CLI utilities
│       ├── project-detector.ts    # Detect existing .claude setup
│       └── file-copier.ts         # Template copying logic
│
├── bin/
│   └── cli.ts                # CLI entry point
│
├── docs/
│   ├── initial.md            # Original design document
│   ├── final-v2.md           # Implementation specification
│   └── REVIEW_FINDINGS.md    # Code review tracking
│
├── package.json
├── tsconfig.json
├── README.md
└── CONTRIBUTING.md
```

### Key Implementation Files

#### `src/templates/hooks/lib/rule-matcher.ts`

**Purpose**: Core pattern matching engine

**Key Methods**:

- `matchPrompt(prompt, modifiedFiles)` - Main entry point, returns ranked matches
- `calculatePromptScore()` - Scores keywords and intent patterns
- `calculateFileScore()` - Scores path patterns and content patterns
- `applyValidationRules()` - Checks files against validation rules
- `limitMatches()` - Respects maxSuggestions, prioritizes critical skills

**Scoring Algorithm**:

```typescript
// Configurable weights (defaults shown)
keywordMatchScore: 10; // Simple substring match
intentPatternScore: 20; // Regex pattern match
filePathMatchScore: 15; // Glob pattern match
fileContentMatchScore: 15; // Content regex match

// Final score = sum of all matching triggers
// Sort by: priority (critical > high > medium > low) then score
```

**Important Pattern**: All regex compilation wrapped in try-catch. Invalid patterns logged to DEBUG, skipped gracefully.

#### `src/templates/hooks/lib/session-state.ts`

**Purpose**: Persist session context across separate hook processes

**Storage Format**: `.claude/cache/session-<id>.json`

```json
{
  "modifiedFiles": ["src/api/users.ts", "src/api/posts.ts"],
  "activeDomains": ["backend"],
  "lastActivatedSkills": {
    "backend-dev-guidelines": 1704067200000
  },
  "createdAt": 1704067200000
}
```

**Key Methods**:

- `init(projectDir)` - Initialize cache directory
- `getSession(sessionId)` - Load or create session data
- `addModifiedFile(sessionId, filePath)` - Track file edits
- `recordSkillActivation(sessionId, skillName)` - Track skill usage
- `wasRecentlyActivated(sessionId, skillName, thresholdMs)` - Prevent spam

**Atomic Write Pattern**:

```typescript
// Write to temp file, then rename (atomic operation)
fs.writeFileSync(tempPath, JSON.stringify(session));
fs.renameSync(tempPath, sessionPath);
```

Prevents corruption if process dies during write.

#### `src/templates/hooks/lib/path-utils.ts`

**Purpose**: Normalize file paths for consistent matching

**Why Critical**: Claude Code tools report absolute paths (`/home/user/project/src/api/users.ts`), but skill-rules.yaml uses relative patterns (`src/api/**/*.ts`). Without normalization, minimatch never matches.

**Key Functions**:

- `normalizeFilePath(absolutePath, projectDir)` → relative path for pattern matching
- `resolveFilePath(relativePath, projectDir)` → absolute path for file I/O

**Pattern**: Use relative paths for matching, absolute paths for reading.

#### `src/templates/hooks/lib/config-loader.ts`

**Purpose**: Load and validate skill-rules.yaml

**Graceful Degradation**:

- Missing config file → return default empty config (don't crash)
- Invalid YAML → return default config
- Missing `skills` object → add empty object
- Invalid regex patterns → skip pattern, log to DEBUG

**Schema**: See TypeScript interfaces:

- `SkillConfig` - Top-level structure
- `SkillRule` - Individual skill configuration
- `ValidationRule` - Quality check definitions

### Hook Execution Flow

#### UserPromptSubmit Hook Flow

```typescript
1. Read stdin (JSON: { session_id, prompt, working_directory })
2. sessionState.init(projectDir)
3. configLoader.loadSkillRules()
4. matcher.matchPrompt(prompt, modifiedFiles)
5. Filter out recently activated skills (prevent spam)
6. matcher.limitMatches(maxSuggestions)
7. Format and print suggestions to stdout
8. Exit with code 0 (Claude injects stdout into context)
```

#### PostToolUse Hook Flow

```typescript
1. Read stdin (JSON: { tool_name, tool_input, session_id })
2. Filter tool_name (only Edit, Write, MultiEdit)
3. Extract file paths from tool_input
4. Normalize paths (absolute → relative)
5. sessionState.addModifiedFile(session_id, normalizedPath)
6. Auto-detect domains (frontend/backend/services)
7. sessionState.saveSession() (persists to disk)
8. Exit with code 0
```

#### Stop Hook Flow

```typescript
1. Read stdin (JSON: { session_id, working_directory })
2. sessionState.init(projectDir)
3. Get modifiedFiles and activatedSkills from session
4. matcher.applyValidationRules(modifiedFiles, activatedSkills)
5. Group reminders by skill
6. Format and print validation feedback
7. Exit with code 0 (non-blocking)
```

## Development Workflow

### Making Changes

1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**

- Edit files in `src/`
- Templates in `src/templates/` will be copied to user projects
- Update tests if applicable

3. **Test locally**

```bash
pnpm build
cd /path/to/test-project
create-auto-loading-claude-skills init
# Test your changes
```

4. **Verify TypeScript**

```bash
npx tsc --noEmit
```

5. **Commit with clear messages**

```bash
git add .
git commit -m "feat: add support for nested validation rules"
```

### Testing Changes

#### Manual Testing

1. **Test CLI commands**

```bash
create-auto-loading-claude-skills init
create-auto-loading-claude-skills add-skill test-skill
create-auto-loading-claude-skills validate
```

2. **Test hook execution**

Create test input file `test-input.json`:

```json
{
  "session_id": "test-session",
  "prompt": "create a new API endpoint",
  "working_directory": "/path/to/project"
}
```

Test UserPromptSubmit hook:

```bash
cat test-input.json | pnpm exec tsx \
  .claude/hooks/skill-activation-prompt.ts
```

3. **Test with real Claude Code**

- Initialize in a test project
- Edit files and ask questions
- Verify skills activate correctly
- Check `.claude/cache/` for session files

#### Integration Testing

Test the full feedback loop:

1. Edit a backend file → PostToolUse tracks it
2. Ask a backend question → UserPromptSubmit suggests backend-dev-guidelines
3. Claude makes edits → PostToolUse tracks changes
4. Stop hook validates → Displays any quality reminders

## Adding Features

### Adding a New CLI Command

1. Create `src/commands/your-command.ts`

```typescript
export async function yourCommand(options: YourOptions): Promise<void> {
  // Implementation
}
```

2. Add to `bin/cli.ts`

```typescript
program
  .command("your-command")
  .description("Description of command")
  .option("-o, --option <value>", "Option description")
  .action(yourCommand);
```

3. Update README.md with command documentation

### Adding Hook Functionality

**Example: Add a new trigger type**

1. Update `SkillRule` interface in `config-loader.ts`:

```typescript
export interface SkillRule {
  // ... existing fields
  newTriggerType?: {
    patterns: string[];
  };
}
```

2. Add matching logic in `rule-matcher.ts`:

```typescript
private calculateNewScore(data: any, rule: SkillRule): number {
  let score = 0;
  if (rule.newTriggerType?.patterns) {
    // Implement matching logic
  }
  return score;
}
```

3. Integrate in `matchPrompt()`:

```typescript
const newScore = this.calculateNewScore(data, rule);
score += newScore;
```

4. Update schema in template `skill-rules.yaml`
5. Document in README.md

### Adding Validation Rule Types

1. Extend `ValidationRule` interface in `config-loader.ts`:

```typescript
export interface ValidationRule {
  name: string;
  condition: {
    pattern?: string;
    pathPattern?: string;
    newCondition?: string; // Add new condition type
  };
  requirement: {
    pattern?: string;
    fileExists?: string;
    newRequirement?: string; // Add new requirement type
  };
  reminder: string;
}
```

2. Update `checkCondition()` in `rule-matcher.ts`:

```typescript
if (condition.newCondition) {
  // Implement new condition check
}
```

3. Update `checkRequirement()` in `rule-matcher.ts`:

```typescript
if (requirement.newRequirement) {
  // Implement new requirement check
}
```

4. Add examples to README.md

## Code Style and Standards

### TypeScript Guidelines

- **Use strict mode**: All code must pass `tsc --noEmit`
- **Explicit types**: No implicit `any`, define interfaces for data structures
- **Null safety**: Use optional chaining (`?.`) and nullish coalescing (`??`)
- **Error handling**: Wrap risky operations in try-catch, log to DEBUG
- **Comments**: Use lowercase for single-line comments (`// like this`)

### Graceful Degradation Principles

**Critical Philosophy**: The system must never block user workflow.

```typescript
// ✅ GOOD - Graceful degradation
try {
  const pattern = new RegExp(userPattern);
} catch (error) {
  if (process.env.DEBUG) {
    console.warn(`Invalid regex: ${userPattern}`);
  }
  continue; // Skip invalid pattern, process others
}

// ❌ BAD - Crashes entire hook
const pattern = new RegExp(userPattern); // Throws on invalid regex
```

**Guidelines**:

- Missing config file → return default empty config
- Invalid YAML → return default config
- Malformed regex → skip pattern, log warning
- Missing skill file → return null, continue
- File read error → skip file, continue
- All hooks exit with code 0 (never block Claude)

### Path Handling

**Always normalize paths before pattern matching**:

```typescript
// ✅ GOOD
const normalizedPath = normalizeFilePath(absolutePath, projectDir);
if (minimatch(normalizedPath, pattern)) { ... }

// ❌ BAD - Absolute paths never match relative patterns
if (minimatch(absolutePath, "src/api/**/*.ts")) { ... }
```

**Always resolve paths before file I/O**:

```typescript
// ✅ GOOD
const absolutePath = resolveFilePath(relativePath, projectDir);
const content = fs.readFileSync(absolutePath, "utf8");

// ❌ BAD - Relative path may not exist from current directory
const content = fs.readFileSync(relativePath, "utf8");
```

### Performance Considerations

- **Keyword matching before regex**: Keywords are O(n), patterns are expensive
- **Break early**: Use `break` when first match is sufficient
- **Cache compiled patterns**: Compile regex once in constructor
- **Lazy file reading**: Only read file content when contentPatterns exist

### Debug Logging

Use `process.env.DEBUG` for development/troubleshooting output:

```typescript
if (process.env.DEBUG) {
  console.warn("⚠️  Warning: something unexpected happened");
  console.log("Debug info:", someData);
}
```

Users can enable with:

```bash
DEBUG=true claude-code
```

## Pull Request Process

### Before Submitting

1. **TypeScript check passes**

```bash
npx tsc --noEmit
```

2. **Test CLI commands manually**

- `init` creates correct structure
- `add-skill` generates valid template
- `validate` catches config errors
- `upgrade` preserves user modifications

3. **Test hook execution**

- UserPromptSubmit suggests correct skills
- PostToolUse tracks files to session
- Stop hook validates properly

4. **Update documentation**

- Add new features to README.md
- Document breaking changes in PR description
- Update CONTRIBUTING.md if architecture changes

### PR Description Template

```markdown
## Description

Brief summary of changes

## Motivation

Why is this change needed?

## Changes Made

- List key changes
- Include file paths
- Note breaking changes

## Testing

How was this tested?

- [ ] TypeScript compilation passes
- [ ] Manual CLI testing completed
- [ ] Hook execution verified
- [ ] Real Claude Code integration tested

## Documentation

- [ ] README.md updated
- [ ] CONTRIBUTING.md updated (if applicable)
- [ ] Code comments added for complex logic

## Checklist

- [ ] No TypeScript errors
- [ ] Graceful degradation principles followed
- [ ] Debug logging added where appropriate
- [ ] Breaking changes documented
```

### Review Process

1. **Automated checks**: TypeScript compilation must pass
2. **Code review**: Maintainer reviews for architecture, style, documentation
3. **Testing**: Reviewer tests changes in real Claude Code environment
4. **Approval**: Once approved, PR is merged

### Commit Message Format

Follow conventional commits:

```
feat: add support for nested validation rules
fix: normalize paths before pattern matching
docs: update configuration examples in README
refactor: extract path utils into separate module
chore: update dependencies
```

## Architectural Decisions

### Why TypeScript without Transpilation?

Using Node.js `--experimental-strip-types` eliminates build step for users. They can read and modify hook files directly. Trade-off: Requires Node 18+.

### Why YAML for Configuration?

More human-friendly than JSON for large configurations. Supports comments. Easier for non-developers to edit trigger patterns.

### Why Filesystem for Session State?

Each hook runs in separate process. In-memory state is lost. Filesystem provides:

- Cross-process persistence
- Survives Claude Code restarts
- Easy debugging (inspect `.claude/cache/`)

### Why Separate Hooks Instead of One?

Each lifecycle point has distinct purpose:

- **UserPromptSubmit**: Only point for context injection
- **PostToolUse**: Triggered by specific tools (Edit/Write)
- **Stop**: Runs after Claude completes

Separation follows single-responsibility principle.

### Why Scoring System vs Binary Match?

Scoring enables ranking when multiple skills match. Allows fine-tuning activation priority through configurable weights. More flexible than simple yes/no matching.

## Common Issues and Solutions

### Issue: Skills Not Activating

**Check**:

1. TypeScript compilation errors in hooks
2. Hook permissions (`chmod +x .claude/hooks/*.sh` if using shell wrappers)
3. Pattern syntax (test with `validate` command)
4. DEBUG mode to see matching process

### Issue: Path Patterns Not Matching

**Cause**: Absolute vs relative path mismatch

**Solution**: Ensure PostToolUse normalizes paths before storing, UserPromptSubmit loads normalized paths for matching.

### Issue: Session State Not Persisting

**Check**:

1. `.claude/cache/` directory exists and is writable
2. `sessionState.init()` called before operations
3. No errors in `saveSession()` (check DEBUG output)

### Issue: Regex Crashes Hook

**Cause**: Invalid regex pattern in config

**Solution**: All RegExp construction should be in try-catch:

```typescript
try {
  const pattern = new RegExp(userPattern);
} catch (error) {
  if (process.env.DEBUG) {
    console.warn(`Invalid regex: ${userPattern}`);
  }
  continue;
}
```

## Questions?

- **Found a bug?** Open an issue with reproduction steps
- **Have a feature idea?** Open an issue to discuss before implementing
- **Need help?** Ask in discussions or comment on relevant issue

Thank you for contributing! 🎉
