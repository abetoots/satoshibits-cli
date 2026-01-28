# Helper Package Examples

These examples demonstrate how to use the `create-auto-loading-claude-skills` helper package to create custom validators for Claude Code stop hooks.

## Overview

The helper package provides:

1. **Primitives (Tier 1)**: Building blocks for creating validators
   - `createSession()` - Access session state
   - `createUI()` - Display reminders to users
   - `createValidator()` - Build validators with error handling
   - `runValidators()` - Run multiple validators

2. **Pre-built Validators (Tier 2)**: Ready-to-use validators
   - `validators.layeredArchitecture` - Validates layered architecture patterns

3. **Internal Utilities**: Low-level utilities for advanced use cases
   - `sessionState` - Session state management
   - `ConfigLoader` - Load skill configuration
   - `RuleMatcher` - Match rules against files

## Examples

### 1. `custom-validations.ts` (Comprehensive)

Full-featured example demonstrating:
- Using pre-built validators
- Creating custom validators
- Cross-skill validation
- Pattern-based reminders
- Composing multiple validators

**Use this when**: You want to see all features and capabilities

### 2. `simple-validator.ts` (Starter)

Minimal example showing:
- Basic validator structure
- Reading session state
- Adding reminders

**Use this when**: You're just getting started

## Installation

1. Install the package in your project:
```bash
npm install @satoshibits/create-auto-loading-claude-skills
# or
pnpm add @satoshibits/create-auto-loading-claude-skills
```

2. Copy an example to your project's `.claude/hooks/` directory:
```bash
cp examples/simple-validator.ts .claude/hooks/custom-validations.ts
```

3. Configure the hook in `.claude/settings.json`:
```json
{
  "hooks": {
    "stop": {
      "command": "node .claude/hooks/custom-validations.ts"
    }
  }
}
```

## Creating Custom Validators

### Basic Pattern

```typescript
import { createValidator } from '@satoshibits/create-auto-loading-claude-skills/helpers';

const myValidator = createValidator({
  name: 'my-validator',
  description: 'What this validator checks',

  validate: ({ session, ui }) => {
    // 1. Check session state
    const modifiedFiles = session.getModifiedFiles();
    const isSkillActive = session.isSkillActive('skill-name');
    const projectDir = session.projectDir; // Access via session if needed

    // 2. Analyze files/patterns
    // ...your validation logic...

    // 3. Add reminders
    ui.addReminder({
      message: 'Your reminder message',
      priority: 'medium', // 'critical' | 'high' | 'medium' | 'low'
      file: 'path/to/affected/file.ts'
    });
  }
});
```

### Session API

```typescript
// Check if a skill is activated
session.isSkillActive('frontend-dev-guidelines')

// Get all activated skills
session.getActivatedSkills() // => ['skill-1', 'skill-2']

// Get modified files (returns ModifiedFile objects with content)
session.getModifiedFiles() // => [{ path: 'src/file1.ts', content: '...', absolutePath: '/full/path/...', extension: '.ts' }, ...]

// Check for file patterns
session.hasModifiedFiles('components') // string matching
session.hasModifiedFiles(/\.tsx$/) // regex matching
```

### UI API

```typescript
// Add a single reminder
ui.addReminder({
  message: 'Your message',
  priority: 'medium',
  file: 'file1.ts'
})

// Add multiple reminders
ui.addReminders([
  { message: 'First reminder', priority: 'low' },
  { message: 'Second reminder', priority: 'medium' }
])
```

## Common Patterns

### 1. Cross-Skill Validation

Only run when specific skills are activated together:

```typescript
validate: ({ session, ui }) => {
  if (session.isSkillActive('frontend') && session.isSkillActive('backend')) {
    ui.addReminder({
      message: 'Both frontend and backend modified. Check API consistency.',
      priority: 'medium'
    });
  }
}
```

### 2. File Pattern Validation

Check for specific file patterns:

```typescript
validate: ({ session, ui }) => {
  if (session.hasModifiedFiles(/\/controllers\//)) {
    ui.addReminder({
      message: 'Controllers modified. Run integration tests.',
      priority: 'low'
    });
  }
}
```

### 3. Orchestrating External Tools

Remind users to run linters or type checkers:

```typescript
validate: ({ session, ui }) => {
  const tsFiles = session.getModifiedFiles().filter(f => /\.tsx?$/.test(f.path));

  if (tsFiles.length > 0) {
    ui.addReminder({
      message: 'TypeScript files modified. Run: npm run type-check',
      priority: 'low'
    });
  }
}
```

## Testing Validators

Use `createTestUI()` for testing:

```typescript
import { createSession, createTestUI, runValidators } from '@satoshibits/create-auto-loading-claude-skills/helpers';

const session = createSession(sessionId, projectDir);
const ui = createTestUI();
await runValidators([myValidator], session, ui);

const reminders = ui.getReminders();
assert.strictEqual(reminders.length, 1);
assert.strictEqual(reminders[0].message, 'Expected message');
```

## Debugging

Set `DEBUG=1` to see error messages:

```bash
DEBUG=1 node .claude/hooks/custom-validations.ts
```

## Next Steps

1. Start with `simple-validator.ts`
2. Add your own validation logic
3. Use `custom-validations.ts` for more advanced patterns
4. Create tests using the primitives
5. Share your validators with the community!
