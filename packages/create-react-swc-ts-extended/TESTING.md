# Manual Testing Checklist

This document outlines steps to manually test the `create-react-swc-ts-extended` CLI before publishing.

## Prerequisites

- Node.js v16+
- pnpm, npm, or yarn installed

## Testing Process

### 1. Local Installation Testing

- [ ] Build the package: `pnpm build`
- [ ] Link globally: `pnpm link --global`
- [ ] Run from any directory: `create-react-swc-ts-extended`
- [ ] Verify project creation with default values
- [ ] Test overwriting an existing directory
- [ ] Test with custom project name

### 2. Package Manager Testing

Test with different package managers:

- [ ] pnpm: Select pnpm as package manager
- [ ] npm: Select npm as package manager
- [ ] yarn: Select yarn as package manager

Verify that:

- Dependencies install correctly
- No errors during installation

### 3. Git Integration Testing

- [ ] Test with Git initialization enabled
- [ ] Test with Git initialization disabled
- [ ] Verify .gitignore file is created and properly formatted

### 4. Project Verification

After creating a project, verify:

- [ ] Project structure matches template
- [ ] `package.json` has correct project name
- [ ] Development server starts: `pnpm dev` (or npm/yarn)
- [ ] Build works: `pnpm build`
- [ ] Tests run: `pnpm test`
- [ ] Linting works: `pnpm lint`
- [ ] Type checking works: `pnpm typecheck`

### 5. Functional Validation

For each created project:

- [ ] Run `pnpm lint` and verify no errors occur
- [ ] Run `pnpm typecheck` and verify no type errors occur
- [ ] Run `pnpm test` and verify all tests pass
- [ ] Make a deliberate lint error and verify lint catches it
- [ ] Make a deliberate type error and verify typecheck catches it
- [ ] Make a deliberate test failure and verify test reports it

### 6. Cross-platform Testing (if possible)

- [ ] Test on Linux
- [ ] Test on macOS
- [ ] Test on Windows

### 7. Common Edge Cases

- [ ] Project name with special characters
- [ ] Creating project in directory with limited permissions
- [ ] Creating project with very long name

## Final Verification

- [ ] Run unit tests: `pnpm test`
- [ ] Check code coverage: `pnpm test:coverage`
- [ ] Run the automated verification script: `./test-verification.sh`
