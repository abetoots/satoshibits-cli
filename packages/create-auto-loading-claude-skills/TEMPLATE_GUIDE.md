# Template Contribution Guide

**Version**: 1.0
**Last Updated**: 2025-01-17

Welcome to the template contribution guide! This document explains how to create high-quality skill templates for the auto-loading Claude skills system.

---

## Table of Contents

1. [What is a Template?](#what-is-a-template)
2. [Template Structure](#template-structure)
3. [Creating Your First Template](#creating-your-first-template)
4. [Template Manifest Schema](#template-manifest-schema)
5. [Writing SKILL.md](#writing-skillmd)
6. [Best Practices](#best-practices)
7. [Testing Your Template](#testing-your-template)
8. [Submission Guidelines](#submission-guidelines)

---

## What is a Template?

A **template** is a pre-built, reusable skill that users can install via:

```bash
npx create-auto-loading-claude-skills add-skill --template
```

Templates provide:

- **SKILL.md**: The skill content (patterns, guidelines, examples)
- **template.json**: Metadata and activation rules
- **resources/**: Optional supporting documentation

Templates save users time by providing battle-tested patterns for common domains (backend, frontend, testing, etc.).

---

## Template Structure

Each template lives in `src/templates/skills/{template-name}/` with this structure:

```
src/templates/skills/
└── your-template-name/
    ├── template.json          # Required: Manifest with metadata and activation rules
    ├── SKILL.md              # Required: Skill content
    └── resources/            # Optional: Supporting documentation
        ├── example-1.md
        └── example-2.md
```

### Required Files

1. **template.json**: Defines template metadata and skill activation rules
2. **SKILL.md**: Contains the actual skill content Claude will read

### Optional Files

- **resources/**: Directory for deep-dive documentation that's too long for SKILL.md
  - Referenced from SKILL.md for progressive disclosure
  - Examples: detailed API docs, migration guides, architecture diagrams

---

## Creating Your First Template

### Step 1: Choose a Template Name

Use the naming convention: `{domain}-{aspect}-{type}`

**Good Examples**:

- `backend-dev-guidelines`
- `frontend-testing-patterns`
- `api-security-checklist`
- `database-migration-guide`

**Bad Examples**:

- `mytemplate` (too generic)
- `BackendGuidelines` (wrong case)
- `backend_guidelines` (use hyphens, not underscores)

### Step 2: Create the Directory

```bash
mkdir -p src/templates/skills/your-template-name
cd src/templates/skills/your-template-name
```

### Step 3: Create template.json

```json
{
  "version": "1.0",
  "name": "your-template-name",
  "displayName": "Your Template Display Name",
  "description": "Brief description (shown in template catalog)",
  "category": "development",
  "tags": ["tag1", "tag2", "tag3"],
  "author": "your-name or organization",

  "variables": {
    "PROJECT_NAME": "Your Project",
    "CUSTOM_VAR": "Default Value"
  },

  "skillRule": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "description": "Brief description for skill-rules.yaml",

    "promptTriggers": {
      "keywords": ["keyword1", "keyword2"],
      "intentPatterns": [
        "(action).*?(target)",
        "(how to|best practice).*?(topic)"
      ]
    },

    "fileTriggers": {
      "pathPatterns": ["path/to/files/**/*.ext"],
      "contentPatterns": ["import.*library", "export.*Pattern"]
    },

    "validationRules": [
      {
        "name": "descriptive-name",
        "condition": {
          "pattern": "pattern-to-detect"
        },
        "requirement": {
          "pattern": "expected-pattern"
        },
        "reminder": "Did you add X?"
      }
    ]
  }
}
```

### Step 4: Create SKILL.md

```markdown
---
name: your-template-name
description: Brief description of what this skill provides
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
model: inherit
---

# Your Template Display Name

## Purpose

Explain what this skill provides and why it's valuable.

## When This Skill Activates

This skill automatically activates when you:

- Mention keywords: [list keywords]
- Ask about [topic]
- Edit files in: [paths]
- Work with code that [patterns]

## [Main Section 1]

Content here...

## [Main Section 2]

Content here...

## Quick Reference

Checklists, common patterns, file organization...

## Related Resources

For deeper dives, see the resources directory.
```

---

## Template Manifest Schema

### Top-Level Fields

| Field         | Type     | Required | Description                                                  |
| ------------- | -------- | -------- | ------------------------------------------------------------ |
| `version`     | string   | ✅       | Schema version (currently "1.0")                             |
| `name`        | string   | ✅       | Template identifier (kebab-case)                             |
| `displayName` | string   | ✅       | Human-readable name                                          |
| `description` | string   | ✅       | Brief description for catalog                                |
| `category`    | string   | ✅       | One of: development, testing, documentation, quality, custom |
| `tags`        | string[] | ✅       | Searchable tags                                              |
| `author`      | string   | ❌       | Author name or organization                                  |
| `variables`   | object   | ❌       | Variable substitution (see below)                            |
| `skillRule`   | object   | ✅       | Activation rules (see below)                                 |

### Category Values

Choose the most appropriate category:

- **development**: General development patterns (backend, frontend, mobile)
- **testing**: Testing strategies, test patterns, QA guidelines
- **documentation**: Documentation standards, API docs, README patterns
- **quality**: Code quality, linting, error handling, security
- **custom**: Domain-specific or organizational patterns

### Variables

Variables enable customization during installation:

```json
"variables": {
  "PROJECT_NAME": "My Project",
  "BACKEND_FRAMEWORK": "Express.js",
  "DATABASE_ORM": "Prisma"
}
```

Use in SKILL.md with double braces:

```markdown
This skill provides {{BACKEND_FRAMEWORK}} patterns for {{PROJECT_NAME}}.
```

During installation, users can override defaults:

```typescript
catalog.install(template, projectDir, {
  PROJECT_NAME: path.basename(projectDir),
  BACKEND_FRAMEWORK: "Fastify",
});
```

### skillRule Object

The `skillRule` defines when and how the skill activates:

```json
"skillRule": {
  "type": "domain" | "guardrail",
  "enforcement": "suggest" | "warn" | "block",
  "priority": "critical" | "high" | "medium" | "low",
  "description": "Brief description",
  "promptTriggers": { ... },
  "fileTriggers": { ... },
  "validationRules": [ ... ]
}
```

#### type

- **domain**: Provides guidance and best practices (most templates)
- **guardrail**: Enforces critical constraints (breaking changes, security)

#### enforcement

- **suggest**: Shows recommendations, users can ignore (default)
- **warn**: Prominent warning, but allows continuation
- **block**: Prevents action until skill loaded (use sparingly)

#### priority

- **critical**: ⚠️ Must be addressed immediately (reserved for guardrails)
- **high**: 📚 Strongly recommended (most domain skills)
- **medium**: 💡 Helpful suggestions
- **low**: 📌 Optional enhancements (experimental skills)

### promptTriggers

Analyzes user prompts to detect relevant context:

```json
"promptTriggers": {
  "keywords": [
    "controller",
    "service",
    "API",
    "endpoint"
  ],
  "intentPatterns": [
    "(create|add|build).*?(route|endpoint)",
    "(how to|best practice).*?(backend|API)"
  ]
}
```

**keywords**: Case-insensitive substring matching (fast)

- Use domain-specific terms
- Include synonyms (API, endpoint, route)
- 5-15 keywords recommended

**intentPatterns**: Regex for natural language variations

- Use non-greedy matching: `.*?`
- Capture action verbs: `(create|add|build|modify)`
- Match common questions: `(how to|best practice|should I)`
- Test with real user prompts

### fileTriggers

Activates based on file context (path or content):

```json
"fileTriggers": {
  "pathPatterns": [
    "src/api/**/*.ts",
    "backend/**/*.ts",
    "services/*/src/**/*.ts"
  ],
  "contentPatterns": [
    "import.*express",
    "export.*Controller",
    "router\\."
  ]
}
```

**pathPatterns**: Glob patterns for file paths

- Use `**` for recursive matching
- Match specific directories: `src/components/**/*.tsx`
- Support monorepos: `packages/*/src/**/*.ts`

**contentPatterns**: Regex for code signatures

- Match imports: `import.*react`
- Match class patterns: `extends BaseController`
- Match function patterns: `useState|useEffect`
- Escape special characters: `router\\.`

### validationRules

Provide helpful reminders during coding:

```json
"validationRules": [
  {
    "name": "error-tracking",
    "condition": {
      "pattern": "try\\s*\\{"
    },
    "requirement": {
      "pattern": "captureException|logger\\.error"
    },
    "reminder": "Did you add error tracking to catch blocks?"
  },
  {
    "name": "validation-middleware",
    "condition": {
      "pattern": "router\\.(post|put|patch)",
      "pathPattern": ".*/routes/.*"
    },
    "requirement": {
      "pattern": "validate|validateRequest"
    },
    "reminder": "Did you add validation middleware?"
  }
]
```

**Validation Rule Fields**:

- **name**: Unique identifier for the rule
- **condition**: When to check (pattern and/or pathPattern)
  - `pattern`: Regex to detect triggering code
  - `pathPattern`: Optional regex for file path
- **requirement**: What to look for (pattern and/or fileExists)
  - `pattern`: Regex for expected code
  - `fileExists`: Path to required file
- **reminder**: User-friendly message

**Best Practices for Validation Rules**:

- Be helpful, not annoying (suggest, don't demand)
- Focus on common mistakes
- Keep messages friendly and actionable
- Limit to 2-5 rules per skill

---

## Writing SKILL.md

### YAML Frontmatter (Required)

Every SKILL.md starts with frontmatter:

```yaml
---
name: your-template-name
description: Brief description (1-2 sentences)
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
model: inherit
---
```

**Fields**:

- **name**: Must match template directory name
- **description**: What the skill provides
- **allowed-tools**: Tools Claude can use (comma-separated)
- **model**: Use "inherit" to use project default

### The 500-Line Rule

**Keep SKILL.md under 500 lines** for context efficiency.

**Why?** Claude has limited context window. Skills under 500 lines:

- Load quickly without context exhaustion
- Are easier to maintain and update
- Force focus on essential patterns

**If you need more**: Use progressive disclosure:

1. **SKILL.md**: High-level guidance, workflows, quick reference
2. **resources/**: Deep-dive documentation for specific topics

### Required Sections

#### 1. Title and Purpose

```markdown
# Backend Development Guidelines

## Purpose

This skill provides battle-tested patterns for building production-ready
backend APIs with Express, TypeScript, and Prisma. It emphasizes code
organization, error handling, validation, and scalability.
```

#### 2. When This Skill Activates

**Critical**: Users need to understand when skills trigger.

```markdown
## When This Skill Activates

This skill automatically activates when you:

- Mention keywords: controller, service, route, API, endpoint, database
- Ask about backend architecture or best practices
- Edit files in: `src/api/`, `backend/`, `services/`, `routes/`
- Work with code that imports Express, Prisma, or database clients
```

#### 3. Core Patterns

Provide concrete, actionable patterns:

```markdown
## Core Architecture Patterns

### 1. Three-Layer Architecture

[Explanation]

[Code example]

**Key Principles**:

- Bullet point
- Bullet point

### 2. Controller Layer

[Pattern with example]
```

**Best Practices**:

- Use numbered sections for sequential reading
- Provide code examples (20-30 lines max)
- Explain WHY, not just WHAT
- Highlight key principles after examples

#### 4. Quick Reference

Essential for fast lookups:

```markdown
## Quick Reference

### File Organization
```

path/structure/
├── explained/
└── here/

```

### Checklist for New Endpoints
- [ ] Route defined
- [ ] Validation added
- [ ] Error handling included
- [ ] Tests written

### Common Patterns
- **Pattern Name**: Brief description
- **Pattern Name**: Brief description
```

### Optional Sections

Add as needed:

- **Troubleshooting**: Common issues and solutions
- **Migration Guide**: From old patterns to new
- **Advanced Topics**: For power users
- **Examples**: Real-world use cases

### Writing Style

**✅ DO**:

- Use clear, concise language
- Provide code examples
- Explain tradeoffs ("Use X when Y, but Z if A")
- Include "why" explanations
- Use consistent formatting

**❌ DON'T**:

- Assume knowledge (explain acronyms)
- Write walls of text (break into sections)
- Include unnecessary details (link to docs instead)
- Use jargon without explanation

### Code Examples

**Good Example Structure**:

````markdown
### Controller Pattern

**Bad**: No error handling

​`typescript
async function getUser(req, res) {
  const user = await db.user.findOne(req.params.id);
  res.json(user);
}
​`

**Good**: Proper error handling

​`typescript
async function getUser(req, res, next) {
  try {
    const user = await db.user.findOne(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ data: user });
  } catch (error) {
    captureException(error);
    next(error);
  }
}
​`

**Key Principles**:

- Always wrap in try-catch
- Return proper status codes
- Log errors before handling
````

---

## Best Practices

### 1. Start Narrow, Expand Gradually

**Initial Release**:

```json
"keywords": ["controller", "API", "endpoint"]
```

**After Testing**:

```json
"keywords": ["controller", "API", "endpoint", "route", "service", "backend"]
```

Add keywords based on real usage patterns.

### 2. Test Pattern Matching

Before submitting, test your patterns:

```bash
# Test keyword activation
echo '{"prompt":"create a new API endpoint"}' | \
  node .claude/hooks/skill-activation-prompt.js

# Test file pattern activation
# Edit a file matching your pathPatterns and verify activation
```

### 3. Validate Against Schema

Ensure template.json is valid:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/templates/skills/your-template-name/template.json'))"
```

### 4. Check Line Count

```bash
wc -l src/templates/skills/your-template-name/SKILL.md
```

Should be under 500 lines.

### 5. Follow Existing Patterns

Review existing templates for consistency:

- backend-dev-guidelines
- frontend-dev-guidelines
- error-handling

### 6. Use Meaningful Tags

Tags help users discover templates:

```json
"tags": ["backend", "API", "express", "typescript", "prisma"]
```

**Good Tags**:

- Technology stack: "react", "express", "postgres"
- Domain: "backend", "frontend", "testing"
- Patterns: "architecture", "error-handling", "validation"

**Bad Tags**:

- Too generic: "code", "programming"
- Too specific: "user-authentication-with-jwt-and-refresh-tokens"

---

## Testing Your Template

### Manual Testing

1. **Build the CLI**:

   ```bash
   npm run build
   ```

2. **Test Template Loading**:

   ```bash
   npx tsx -e "
   import { TemplateCatalog } from './src/utils/template-catalog.js';
   const catalog = new TemplateCatalog();
   const template = catalog.load('your-template-name');
   console.log(template ? '✓ Loaded' : '✗ Failed');
   "
   ```

3. **Test Installation**:

   ```bash
   # Create test project
   mkdir /tmp/test-project
   cd /tmp/test-project

   # Initialize
   npx create-auto-loading-claude-skills init

   # Install your template
   npx create-auto-loading-claude-skills add-skill --template
   # Select your template from the list

   # Verify files created
   ls -la .claude/skills/your-template-name/
   cat .claude/skills/your-template-name/SKILL.md
   cat .claude/skills/skill-rules.yaml
   ```

4. **Test Variable Substitution**:

   ```bash
   # Check that {{VARIABLE}} patterns were replaced
   grep "{{" .claude/skills/your-template-name/SKILL.md
   # Should return no results
   ```

5. **Test Activation**:

   ```bash
   # Install dependencies
   cd .claude/hooks
   npm install

   # Test activation
   cd ../..
   echo '{"prompt":"your test prompt with keywords"}' | \
     node .claude/hooks/skill-activation-prompt.js
   ```

### Validation Checklist

Before submitting, verify:

- [ ] template.json is valid JSON
- [ ] All required fields present in template.json
- [ ] SKILL.md has valid YAML frontmatter
- [ ] SKILL.md is under 500 lines
- [ ] Template name uses kebab-case
- [ ] Category is one of: development, testing, documentation, quality, custom
- [ ] At least 3 keywords defined
- [ ] At least 1 intent pattern defined
- [ ] At least 1 file pattern defined (path or content)
- [ ] Validation rules have helpful messages
- [ ] Code examples are tested and correct
- [ ] Variable substitution works (if using variables)
- [ ] No sensitive data in examples (API keys, passwords)

---

## Submission Guidelines

### Before Submitting

1. **Test Thoroughly**: Follow all testing steps above
2. **Review Existing Templates**: Ensure consistency with project style
3. **Update Documentation**: If your template introduces new patterns

### Submission Process

1. **Fork the Repository**:

   ```bash
   git clone https://github.com/your-username/create-auto-loading-claude-skills
   cd create-auto-loading-claude-skills
   ```

2. **Create a Branch**:

   ```bash
   git checkout -b template/your-template-name
   ```

3. **Add Your Template**:

   ```bash
   mkdir -p src/templates/skills/your-template-name
   # Add template.json and SKILL.md
   ```

4. **Verify TypeScript Compilation**:

   ```bash
   npm run build
   npx tsc --noEmit
   ```

5. **Commit Your Changes**:

   ```bash
   git add src/templates/skills/your-template-name/
   git commit -m "feat(templates): add your-template-name skill

   - Adds template for [describe purpose]
   - Includes [key features]
   - Tested with [testing approach]"
   ```

6. **Push and Create PR**:

   ```bash
   git push origin template/your-template-name
   ```

   Then create a Pull Request with:

   - **Title**: `feat(templates): add [template-name] skill`
   - **Description**: Explain what the template provides, why it's valuable, and how it was tested

### PR Description Template

```markdown
## Template: [Your Template Name]

### Purpose

Brief explanation of what this template provides.

### Category

development | testing | documentation | quality | custom

### Target Audience

Who will benefit from this template?

### Key Features

- Feature 1
- Feature 2
- Feature 3

### Testing

How did you test this template?

- [ ] Manual installation test
- [ ] Variable substitution verified
- [ ] Activation patterns tested
- [ ] Code examples validated

### Checklist

- [ ] template.json is valid JSON
- [ ] SKILL.md under 500 lines
- [ ] No sensitive data in examples
- [ ] Follows existing template patterns
```

---

## Examples

### Minimal Template

For a simple template without variables or validation:

**template.json**:

```json
{
  "version": "1.0",
  "name": "simple-testing-guide",
  "displayName": "Simple Testing Guide",
  "description": "Basic testing patterns for unit and integration tests",
  "category": "testing",
  "tags": ["testing", "jest", "unit-test"],

  "skillRule": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "medium",
    "description": "Basic testing patterns",

    "promptTriggers": {
      "keywords": ["test", "testing", "jest", "spec"],
      "intentPatterns": ["(write|create).*test"]
    },

    "fileTriggers": {
      "pathPatterns": ["**/*.test.ts", "**/*.spec.ts"]
    }
  }
}
```

### Advanced Template

With variables, validation, and resources:

See `src/templates/skills/backend-dev-guidelines/` for a complete example.

---

## FAQ

### Q: How do I choose between domain and guardrail type?

**A**: Use **domain** for 99% of templates. Only use **guardrail** if:

- Preventing a breaking change (e.g., API v1 → v2 migration)
- Enforcing security requirements
- Blocking known dangerous patterns

### Q: My skill is 600 lines. What should I do?

**A**: Break it into:

1. **SKILL.md** (400-500 lines): Core patterns, quick reference
2. **resources/deep-dive.md**: Detailed explanations
3. **resources/examples.md**: Extended code examples

Reference resources from SKILL.md:

```markdown
## Advanced Topics

For deep dives, see:

- [Detailed Architecture](resources/architecture.md)
- [Migration Guide](resources/migration.md)
```

### Q: Should I include external links?

**A**: Yes, but sparingly:

- ✅ Official documentation (framework docs, RFC specs)
- ✅ Authoritative guides (MDN, TypeScript handbook)
- ❌ Blog posts (may go offline)
- ❌ Stack Overflow answers (not authoritative)

### Q: Can I create organization-specific templates?

**A**: Yes! Use:

- **category**: "custom"
- **author**: "Your Organization"
- **tags**: Include your org name

These can be submitted if they have general value, or kept private for your team.

### Q: How do I update an existing template?

**A**:

1. Update files in `src/templates/skills/{template-name}/`
2. Test thoroughly
3. Submit PR with clear description of changes
4. Increment version in template.json if making breaking changes

---

## Resources

- **Example Templates**: `src/templates/skills/`
- **Schema Reference**: This document
- **Best Practices**: `initial.md`
- **Architecture**: `ARCHITECTURE_FIXES.md`

## Questions?

For questions or discussions about template development, please:

1. Check existing templates for examples
2. Review this guide
3. Open an issue on GitHub

---

**Happy template creating! 🚀**
