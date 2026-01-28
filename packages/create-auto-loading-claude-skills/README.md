# Auto-Loading Skills for Claude Code

> Transform Claude Code from a generic assistant into a context-aware domain expert that proactively applies your project-specific patterns.

## The Problem

Claude Code skills are powerful but **native auto-loading is unreliable**. Skills auto-load via `description` matching, but this semantic approach is probabilistic (~70-80% activation rate). Critical workflows get missed, leading to generic advice when project-specific patterns exist.

## The Solution

This package is a **Reliability Engine** that provides **deterministic guarantees** where native features are probabilistic. It uses lifecycle hooks and intelligent pattern matching to decide **WHEN** to suggest or load skills based on:

- **What you're asking** (prompt analysis with keywords and intent patterns)
- **What you're editing** (file path and content pattern matching)
- **What you've been working on** (session context tracking)
- **Your reliability requirements** (configurable `activation_strategy` per skill)

### The Swiss Cheese Model - Layered Reliability

| Layer       | Technology                | Reliability                 | Role                            |
| ----------- | ------------------------- | --------------------------- | ------------------------------- |
| **Layer 1** | Package (Regex/Glob)      | **Deterministic (100%)**    | Guardrails & critical workflows |
| **Layer 2** | Native (Description)      | **Probabilistic (~70-80%)** | General assistance              |
| **Layer 3** | Native (`type: "prompt"`) | **Cognitive (High)**        | Deep contextual decisions       |

The result: **90%+ activation rate** in relevant contexts, up from ~20% with native-only.

## Key Features

### 🚀 Template Catalog

Install production-ready skills in seconds:

```bash
npx cl-auto-skills add-skill --template
```

- **3 starter templates** covering backend, frontend, and error handling
- **Variable substitution** - customize framework names and project settings
- **Pre-configured activation rules** - works out of the box
- **Battle-tested patterns** from real production use

### 📚 Smart Document Discovery

Transform existing documentation into skills automatically:

```bash
npx cl-auto-skills add-skill --interactive
```

- **Scans all `.md` and `.mdx` files** in your project (root and `docs/` directory)
- Discovers CONTRIBUTING.md, STYLE_GUIDE.md, ARCHITECTURE.md, API.md, and any other documentation
- **Intelligent grouping** - multiple files of same type become one skill with multiple resources
- **Cached results** - instant activation on subsequent runs
- **Zero manual configuration** - activation rules generated automatically

## How It Works

The system uses three strategic lifecycle hooks working together. These hooks are **templates copied to your project** during `init`—you own them and can customize as needed.

### BEFORE: Skill Activation (UserPromptSubmit Hook)

When you submit a prompt, **before Claude sees it**, the system:

1. Analyzes your prompt against configured trigger patterns
2. Checks which files you've recently modified
3. Matches both against skill rules (keywords, intent patterns, file paths, code content)
4. Injects ranked skill suggestions into Claude's context

Claude now processes your request already aware of relevant skills.

### DURING: Context Building (PostToolUse Hook)

When Claude modifies files, the system:

1. Tracks which files were edited (normalized paths stored to disk)
2. Auto-detects project domains (frontend vs backend vs services)
3. Persists session state to `.claude/cache/` for cross-process continuity

This file-level context feeds back into skill activation—when you later ask "add validation here," the system knows you recently edited `backend/routes/users.ts` and activates backend skills based on file context, not just prompt keywords.

### AFTER: Quality Validation (Stop Hook)

After Claude finishes, the system validates edited files against activated skills' rules and generates gentle reminders (see [Validation](#validation) section).

## Quick Start

### Installation

```bash
npx cl-auto-skills init
```

This creates:

- `.claude/hooks/` - Hook templates (copied to your project, yours to customize)
- `.claude/skills/` - Directory for your skill definitions
- `.claude/cache/` - Session state storage
- `.claude/settings.json` - Hook configuration

The init command automatically discovers project documentation (CONTRIBUTING.md, ARCHITECTURE.md, etc.) and caches them for quick skill creation. Once installed, the hooks belong to you—customize them for your project's needs.

### Add Your First Skill

**Option 1: Install from Template Catalog** (Fastest)

```bash
npx cl-auto-skills add-skill --template
```

Browse and install production-ready skills:

- **Backend Development Guidelines** - Express/TypeScript/Prisma patterns
- **Frontend Development Guidelines** - React/TypeScript patterns
- **Error Handling & Logging** - Sentry/Winston error tracking patterns

Templates support variable substitution - customize for your project during installation.

**Option 2: Create from Discovered Docs** (Project-Specific)

```bash
npx cl-auto-skills add-skill --interactive
```

Automatically creates skills from your existing documentation (CONTRIBUTING.md, STYLE_GUIDE.md, API.md, etc.). The system intelligently groups multiple files of the same type into a single skill with multiple resources.

**Option 3: Create Custom Skill** (Advanced)

```bash
npx cl-auto-skills add-skill backend-dev-guidelines
```

This generates a standard `SKILL.md` file in `.claude/skills/backend-dev-guidelines/` for you to populate with your project's patterns.

### Configure Auto-Activation

The package supports **two workflows** for defining activation rules. Both are valid and can coexist:

| Workflow        | Method                                  | Best For                                                |
| --------------- | --------------------------------------- | ------------------------------------------------------- |
| **Direct YAML** | Edit `skill-rules.yaml` directly        | Getting started, quick iteration, standalone guardrails |
| **Co-located**  | `x-smart-triggers` in SKILL.md → `sync` | Team-shared skills, version control, scaling            |

> **Note**: The `sync` command preserves manual entries. You can mix both approaches freely.

#### Workflow 1: Direct YAML Editing (Simple Start)

If you installed from templates or used interactive mode, activation rules are created automatically. For custom skills, edit `.claude/skills/skill-rules.yaml`:

```yaml
version: "1.0"
description: "Auto-activation rules for skills"

settings:
  maxSuggestions: 3
  scoring:
    keywordMatchScore: 10
    intentPatternScore: 20
    filePathMatchScore: 15
    fileContentMatchScore: 15
  thresholds:
    recentActivationMinutes: 5

skills:
  # CRITICAL: Must always activate - bypass native matching
  terraform-apply:
    type: guardrail
    enforcement: block
    priority: critical
    activationStrategy: guaranteed # Package injects directly
    description: Applies Terraform execution plan
    promptTriggers:
      intentPatterns:
        - "(apply|deploy|run).*terraform"
    fileTriggers:
      pathPatterns:
        - "*.tfplan"
        - "*.tf"
    cooldownMinutes: 30

  # HELPFUL: Boost native matching with hints
  backend-dev-guidelines:
    type: domain
    enforcement: suggest
    priority: high
    activationStrategy: suggestive # Package adds hints
    description: Express/Prisma/TypeScript patterns for backend development
    promptTriggers:
      keywords:
        - controller
        - service
        - route
        - API
        - endpoint
        - Prisma
      intentPatterns:
        - "(create|add|modify).*?(route|endpoint|controller|service)"
        - "(how to|best practice).*?(backend|API)"
    fileTriggers:
      pathPatterns:
        - "src/api/**/*.ts"
        - "backend/**/*.ts"
      contentPatterns:
        - "import.*express"
        - "export.*Controller"
        - "import.*Prisma"
```

#### Workflow 2: Co-located Definitions (Scaling Up)

For team-shared skills or larger projects, define triggers in the SKILL.md frontmatter using `x-smart-triggers`:

```yaml
---
name: backend-dev-guidelines
description: Express/Prisma/TypeScript patterns

x-smart-triggers:
  activationStrategy: suggestive
  promptTriggers:
    keywords: [controller, service, route, API]
    intentPatterns: ["(create|add).*?(route|endpoint)"]
  fileTriggers:
    pathPatterns: ["src/api/**/*.ts"]
---
```

Then run `sync` to generate the centralized rules:

```bash
npx cl-auto-skills sync
```

This treats `skill-rules.yaml` as a **build artifact**. Benefits:

- Trigger definitions live with the skill content they control
- Changes are reviewable in PRs alongside skill content
- `sync-status` command enables CI validation

See [ADR-004](docs/adr/004-dual-source-architecture.md) for detailed guidance on when to use each workflow.

### Activation Strategy

Control how each skill interacts with native Claude Code features:

| Strategy          | Behavior                                      | Use Case                              |
| ----------------- | --------------------------------------------- | ------------------------------------- |
| `guaranteed`      | Package injects skill via `additionalContext` | Critical workflows that MUST activate |
| `suggestive`      | Package adds hints via `updatedInput`         | Helpful skills, boost native matching |
| `prompt_enhanced` | Package gathers context → feeds to Haiku hook | Semantic decisions with rich context  |
| `native_only`     | Package does nothing (default)                | General-purpose skills                |

For critical guardrails, use `guaranteed`. For general development skills, `suggestive` or `native_only` is usually sufficient.

**IDE Autocomplete**: The generated `skill-rules.yaml` includes a JSON Schema directive for autocomplete and validation in VS Code (with the Red Hat YAML extension) and JetBrains IDEs.

### Test It

Edit a backend file:

```bash
touch src/api/users.ts
```

Ask Claude: "How should I structure user routes?"

You'll see:

```
🎯 SKILL ACTIVATION CHECK

📚 RECOMMENDED SKILLS:
  → backend-dev-guidelines (prompt + files)
```

Claude will likely invoke the skill automatically and provide project-specific guidance.

## Configuration Guide

### Trigger Pattern Types

#### Keywords (Fast, Explicit)

```yaml
keywords:
  - controller
  - API
  - Prisma
```

Simple case-insensitive substring matching. Best for domain-specific terminology.

#### Intent Patterns (Flexible, Natural Language)

```yaml
intentPatterns:
  - "(create|add|build).*?(route|endpoint|controller)"
  - "database.*?(query|operation|migration)"
```

Regex patterns catch natural language variations. Use non-greedy `.*?` between terms to allow flexibility.

#### File Path Patterns (Location-Based)

```yaml
pathPatterns:
  - "src/api/**/*.ts"
  - "frontend/**/*.tsx"
  - "services/*/src/**/*.ts" # monorepo support
```

Glob syntax matches file locations. Double-asterisk (`**`) matches nested directories recursively.

#### Content Patterns (Code Signature Detection)

```yaml
contentPatterns:
  - "import.*express"
  - "extends BaseController"
  - "useState|useEffect"
```

Regex patterns detect what's **in the code**. Enables activation based on imports, class inheritance, framework usage.

**Important**: When both `pathPatterns` and `contentPatterns` are specified, files must match **BOTH** for the skill to activate based on file context. This prevents false positives—for example, a utility file in `src/api/` that doesn't use Express won't trigger Express-specific guidelines.

### Priority Levels

- **critical**: ⚠️ Displayed with warnings, must be addressed (guardrails)
- **high**: 📚 Prominently shown as "RECOMMENDED SKILLS"
- **medium**: 💡 Helpful suggestions
- **low**: 📌 Optional enhancements

Reserve `critical` for guardrails preventing breaking changes. Most skills should be `high` or `medium`.

### Enforcement Modes

- **suggest**: Shows recommendations, users can ignore (most domain skills)
- **warn**: Prominent warnings, still allows continuation
- **block**: Prevents actions until skill is loaded (critical guardrails)

Separate guidance (`domain` type, `suggest` enforcement) from constraints (`guardrail` type, `block` enforcement).

### Validation Rules

Add quality checks that run **after** Claude finishes (see [Validation](#validation) for full details):

```yaml
validationRules:
  - name: require-try-catch
    condition:
      pathPattern: "src/api/.*\\.ts"
      pattern: "async function|async \\("
    requirement:
      pattern: "try\\s*\\{"
    reminder: "Async functions should include try-catch blocks"
```

### Tunable Scoring

Adjust how strongly different matches influence activation:

```yaml
settings:
  scoring:
    keywordMatchScore: 15 # boost keyword importance
    intentPatternScore: 25 # boost intent pattern importance
    filePathMatchScore: 20 # boost file path matches
    fileContentMatchScore: 20 # boost content pattern matches
  thresholds:
    recentActivationMinutes: 10 # reduce spam with longer cooldown
```

Higher scores = stronger signal for activation. Adjust based on false positives/negatives.

### Debug Logging

Enable debug logging to troubleshoot skill activation and validation:

```yaml
settings:
  enableDebugLogging: true
  debugCategories: # optional: filter by category
    - activation
    - scoring
    - validation
```

Logs are written to `.claude/cache/debug.log` (automatically gitignored). The log file rotates at 1MB.

**Available Categories:**

| Category     | Description                | Example                                                |
| ------------ | -------------------------- | ------------------------------------------------------ |
| `activation` | Skill matching decisions   | "skill 'backend-dev' matched: keyword 'API' (+10)"     |
| `scoring`    | Detailed scoring breakdown | "promptScore=30, fileScore=15, total=45"               |
| `validation` | Stop hook validation       | "rule 'error-handling' failed for 2 files"             |
| `state`      | Session state changes      | "added file 'src/api/users.ts' to modified files"      |
| `perf`       | Timing information         | "prompt matching completed in 12ms"                    |
| `io`         | File/cache operations      | "loaded session abc123 (5 files, 2 skills)"            |
| `error`      | Hook/config errors         | "invalid regex in skill 'backend-dev': unclosed group" |

**Viewing Logs:**

```bash
# view recent log entries
cat .claude/cache/debug.log | jq .

# follow logs in real-time
tail -f .claude/cache/debug.log | jq .

# filter by category
cat .claude/cache/debug.log | jq 'select(.cat == "activation")'
```

**Note:** Logs may contain prompt fragments. Do not share debug logs publicly.

## Best Practices

### Start Narrow, Expand Gradually

Begin with highly specific keywords and patterns. If skills don't activate when expected (false negatives), incrementally add synonyms and broaden patterns. If skills activate too often (false positives), narrow keywords and make patterns more restrictive.

### Template-First Development

Before creating custom skills, check the template catalog:

```bash
npx cl-auto-skills add-skill --template
```

Templates provide:

- Battle-tested patterns from production use
- Pre-configured activation rules
- Variable substitution for customization
- Comprehensive examples and quick references

See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for contributing new templates.

### Test Patterns Before Committing

Use the validation command:

```bash
npx cl-auto-skills validate
```

Test with different prompt phrasings:

- "create a new API endpoint" ✓ Should activate backend-dev-guidelines
- "add user authentication" ✓ Should activate backend-dev-guidelines + auth-patterns
- "fix the navbar styling" ✗ Should NOT activate backend skills

Iterate on patterns based on results.

## Design Philosophy

### Reliability, Not Replacement

This package **augments** Claude Code's native skill system rather than replacing it. Native skill auto-loading via `description` matching is semantic but probabilistic. This package provides deterministic guarantees for critical workflows while delegating general discovery to native features.

**The core principle**: This package provides **RELIABILITY** where native features are **PROBABILISTIC**.

### Ownership Boundaries

| This Package Owns                           | Claude Code Owns                     |
| ------------------------------------------- | ------------------------------------ |
| `activation_strategy` per skill             | Skill execution and runtime behavior |
| Compiler Pattern (`sync` command)           | Context window management            |
| JSON hook output for native integration     | Native hooks defined in SKILL.md     |
| Trigger matching (prompt, file, tool, stop) | Session lifecycle                    |
| Session state (modified files, activations) | Skill content injection              |
| `decision: "block"` enforcement             | Token usage/costs                    |

Hook templates installed by `init` are **copied to your project** and become yours to customize. This follows standard scaffolding patterns (like create-react-app). The package doesn't control runtime behavior—you do.

For detailed boundaries, see [OWNERSHIP_BOUNDARIES.md](OWNERSHIP_BOUNDARIES.md).

### The Compiler Pattern (Co-located Workflow)

For skills that benefit from co-located definitions, the package supports a "Compiler Pattern": define triggers in SKILL.md (`x-smart-triggers` frontmatter), then run `sync` to generate centralized rules.

This is one of two supported workflows—see [Configure Auto-Activation](#configure-auto-activation) for when to use each approach. The compiler pattern excels when:

- Trigger definitions should be reviewed alongside skill content
- Teams need CI validation via `sync-status`
- Scaling beyond a handful of skills

### Work With the Framework

The system leverages Claude Code's native hooks and skill mechanisms rather than replacing them. Skills remain model-invoked, hooks use documented lifecycle points, configuration follows Claude Code conventions. This ensures compatibility with future updates.

### Context is King

Skills are only useful when activated at the right time. The three-hook system provides:

- **Immediate prompt analysis** (what you're asking)
- **Accumulated file context** (what you've been editing)
- **Quality validation** (what was actually produced)

Together, these create comprehensive coverage.

### Progressive Disclosure Manages Complexity

The three-level loading architecture enables comprehensive guidance without overwhelming context limits. Skills can be arbitrarily large by splitting content across resource files that load on demand.

### Gentle Enforcement Beats Strict Blocking

Self-checking hooks use question-based reminders rather than hard blocks. This preserves workflow momentum while creating awareness. In practice, Claude self-corrects when reminded rather than needing forced compliance.

### Declarative Configuration Enables Iteration

Separating trigger logic into `skill-rules.yaml` allows anyone to tune activation patterns. Teams can experiment with keywords and patterns without touching hook code. Configuration lives in git for team-wide consistency.

## Production Results

Based on production deployment managing 300K+ lines of code over six months:

- **90%+ skill activation rate** in relevant contexts (up from ~20%)
- **40-60% reduction** in context consumption through progressive disclosure
- **Zero accumulated errors** between sessions (build checking catches mistakes immediately)
- **Uniform code quality** across 300K+ lines (patterns automatically applied)
- **Team adoption** without coordination overhead (git-committed configuration)

## Advanced Usage

### Monorepo Support

For multi-package projects:

```yaml
fileTriggers:
  pathPatterns:
    - "packages/api/src/**/*.ts"
    - "packages/web/src/**/*.tsx"
    - "services/auth/backend/**/*.ts"
    - "services/payments/backend/**/*.ts"
```

### Progressive Team Rollout

Introduce skills gradually:

1. **Week 1**: `priority: low`, `enforcement: suggest` (visible but ignorable)
2. **Week 2**: `priority: medium` (more visible)
3. **Week 3**: `priority: high` (strongly recommended)
4. **Week 4**: `enforcement: block` for critical patterns (now required)

Gradual adoption gives teams time to adjust and provide feedback.

## Validation

### Overview: Two Complementary Approaches

The system provides two validation methods that work together:

1. **YAML-Based Validation** - Declarative pattern matching in skill-rules.yaml
2. **Code-Based Validation** - Imperative TypeScript for complex logic

| Aspect         | YAML-Based                       | Code-Based                                   |
| -------------- | -------------------------------- | -------------------------------------------- |
| **Use For**    | Single-skill pattern checks      | Cross-skill logic, complex rules             |
| **Complexity** | Simple condition → requirement   | Full programming logic                       |
| **Setup**      | Add to skill-rules.yaml          | Write .claude/hooks/stop-custom.ts           |
| **Example**    | "Async functions need try-catch" | "Frontend + backend = check API consistency" |

### YAML-Based Validation (The Normal Loop)

After Claude finishes, the stop hook applies `validationRules` from activated skills.

**Rule Structure:**

```yaml
validationRules:
  - name: require-try-catch
    condition:
      pathPattern: "src/api/.*\\.ts"
      pattern: "async function|async \\("
    requirement:
      pattern: "try\\s*\\{"
    reminder: "Async functions should include try-catch blocks"
```

**Fields:**

- `condition` - When to check (file path + content patterns)
- `requirement` - What must be present
- `reminder` - Message shown if requirement is missing

**Multiple Rules:**

```yaml
validationRules:
  - name: require-try-catch
    # ... async error handling ...
  - name: require-logging
    # ... error logging ...
  - name: require-tests
    # ... test coverage ...
```

All failures are reported, not just the first one.

**Future Enhancement:** Shared rule sets (not yet implemented) will allow defining reusable validation rules to avoid duplication across skills.

### Code-Based Validation (Custom Validator API)

For complex scenarios YAML can't handle:

- **Cross-skill coordination** - "Frontend + backend modified? Check API consistency"
- **Complex business logic** - "Payment code requires audit logging for GDPR"
- **Tool orchestration** - "Code changed? Remind to run lint/test/build"
- **Stateful checks** - Access session history, conversation context, activated skills

**Quick Example:**

```typescript
import {
  createValidator,
  runValidators,
} from "@satoshibits/create-auto-loading-claude-skills/helpers";

const testReminder = createValidator({
  name: "test-reminder",
  validate: ({ session, ui }) => {
    if (session.hasModifiedFiles(/\.(ts|tsx)$/)) {
      ui.addReminder({
        message: "Code modified. Run: npm test",
        priority: "low",
      });
    }
  },
});

export default async function (session, ui) {
  await runValidators([testReminder], session, ui);
}
```

**Three Tiers:**

**Tier 1: Primitives** - Building blocks

```typescript
// Session API
session.isSkillActive("frontend-dev-guidelines"); // Check if skill active
session.getActivatedSkills(); // All activated skills
session.getModifiedFiles(); // Files with content
session.hasModifiedFiles(/\.tsx$/); // Pattern matching

// UI API
ui.addReminder({
  message: "Your reminder",
  priority: "medium", // 'critical' | 'high' | 'medium' | 'low'
  file: "src/api/users.ts",
});

// Validator builder
createValidator({ name, validate });
runValidators([validator1, validator2], session, ui);
```

**Tier 2: Pre-Built Validators** - Production-ready

```typescript
import { validators } from "@satoshibits/create-auto-loading-claude-skills/helpers";

// Enforces layered architecture
await validators.layeredArchitecture(session, ui, {
  layers: ["controllers", "services", "repositories"],
});

// Detects violations:
// - Controllers directly accessing data layer
// - Services containing UI logic
// - Components directly accessing database
```

**Tier 3: User-Written** - Project-specific

```typescript
// Cross-skill validation
const apiChecker = createValidator({
  name: "api-consistency",
  validate: ({ session, ui }) => {
    if (session.isSkillActive("frontend") && session.isSkillActive("backend")) {
      ui.addReminder({
        message:
          "Both frontend and backend modified. Verify API contract consistency.",
        priority: "medium",
      });
    }
  },
});

// Tool orchestration
const linterReminder = createValidator({
  name: "linter-reminder",
  validate: ({ session, ui }) => {
    if (session.hasModifiedFiles(/\.tsx?$/)) {
      ui.addReminder({
        message: "Run: npm run lint && npm run type-check",
        priority: "low",
      });
    }
  },
});
```

**Examples:** See [`examples/`](./examples/) for comprehensive documentation and testing guide.

### Choosing an Approach

**Start with YAML** for simple pattern checks. **Graduate to code** when you need:

- Logic across multiple skills
- Access to session/conversation state
- Complex business rules
- Orchestration of external tools

**Don't duplicate linters** - Use code-based validation to remind users to run ESLint/TSC, not replace them. Traditional linters provide precise diagnostics and autofixes. Use custom validators for context-aware checks linters can't handle (architectural patterns, cross-file consistency, business logic).

## Commands

### `init`

Initialize the auto-loading skills framework:

```bash
npx cl-auto-skills init
```

Automatically discovers project documentation and sets up hooks. Use `--type`, `--config`, or `--yes` flags for customization (run `init --help` for details).

### `add-skill`

Add skills using templates, interactive discovery, wizard classification, or custom creation:

```bash
# Browse template catalog
npx cl-auto-skills add-skill --template

# Create from discovered docs
npx cl-auto-skills add-skill --interactive

# Classification wizard (recommended for new skills)
npx cl-auto-skills add-skill my-skill --wizard

# Custom skill
npx cl-auto-skills add-skill my-skill --description "Custom patterns" --keywords "api,auth"
```

**Wizard Mode (`--wizard`)**: Interactive classification wizard that guides you through determining the optimal loading strategy for a skill:

- **AUTO-LOAD**: Skills that should activate automatically based on triggers
- **MANUAL-ONLY**: Skills invoked explicitly via `/skill-name`
- **SHADOW**: Skills suggested but not auto-loaded (soft recommendations)

The wizard asks questions about your skill's behavior (domain vs workflow, signal-to-noise ratio, resource intensity) and recommends the appropriate classification with trigger configuration.

Templates support variable substitution with `--var` flags. Run `add-skill --help` for all options.

### `sync`

Generate `skill-rules.yaml` from `x-smart-triggers` frontmatter in SKILL.md files (the "Compiler Pattern"):

```bash
npx cl-auto-skills sync
```

This treats `skill-rules.yaml` as a **build artifact** rather than a manually-edited file. Define triggers in your SKILL.md files, then run `sync` to generate centralized rules.

**SKILL.md with x-smart-triggers:**

```yaml
---
name: terraform-apply
description: Applies Terraform execution plan
disable-model-invocation: true

x-smart-triggers:
  activationStrategy: guaranteed
  promptTriggers:
    intentPatterns: ["(apply|deploy).*terraform"]
  fileTriggers:
    pathPatterns: ["*.tfplan", "*.tf"]
  cooldownMinutes: 30
---
```

Run `claude-skills sync` to generate the corresponding entry in `skill-rules.yaml`.

### `sync-status`

Check if `skill-rules.yaml` is out of sync with SKILL.md frontmatter:

```bash
npx cl-auto-skills sync-status
```

Returns exit code 1 if regeneration is needed. Useful in CI pipelines.

### `validate`

Validate configuration and auto-fix issues:

```bash
npx cl-auto-skills validate
npx cl-auto-skills validate --fix
```

Detects orphaned skill references and unregistered skills.

### `upgrade`

Upgrade to latest version:

```bash
npx cl-auto-skills upgrade
```

Creates backup by default. Use `--no-backup` to skip.

### Available Templates

The template catalog includes production-ready skills following best practices:

**Development**

- **backend-dev-guidelines** - Express/TypeScript/Prisma patterns for scalable backend APIs
  - Three-layer architecture (routes → controllers → services → repositories)
  - Error handling with Sentry, validation with Zod
  - Global error middleware patterns

- **frontend-dev-guidelines** - React/TypeScript patterns for modern UIs
  - Component structure and organization
  - Custom hooks for reusability, state management patterns
  - Performance optimization (useMemo, useCallback, lazy loading)
  - Accessibility best practices

**Quality**

- **error-handling** - Comprehensive error tracking and logging
  - Never swallow errors principle
  - Sentry integration (backend and frontend)
  - Structured logging with Winston
  - Async error handling patterns

Templates support variable substitution - customize framework names, project names, and tool choices during installation.

**Contributing Templates**: See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for instructions on creating and contributing new templates.

## Configuration Reference

For exhaustive documentation of all available options, see the [JSON Schema](schema/skill-rules.schema.json). The schema serves as the canonical reference and provides:

- All property names and types
- Enum values for `type`, `enforcement`, `priority`, and `debugCategories`
- Default values
- Field descriptions

IDEs with YAML/JSON schema support (VS Code with Red Hat YAML extension, JetBrains) will use this schema automatically for autocomplete and validation.

## Requirements

- Claude Code (with hooks support)
- Node.js 18+
- pnpm (recommended) or npm

## License

MIT

## Contributing

**Templates**: See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for creating and contributing skill templates to the catalog.

**Development**: See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture details, and contribution guidelines.

---

**The result**: Skills that actually get used, patterns that actually get followed, context that actually gets preserved. For teams managing large codebases with established conventions, this system is the difference between Claude being occasionally helpful and Claude being consistently valuable.
