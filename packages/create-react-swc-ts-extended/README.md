# create-react-swc-ts-extended

A CLI tool to bootstrap a React project with TypeScript, SWC, Vite, Vitest, Testing Library, TailwindCSS, ESLint, Prettier, Husky, and lint-staged.

## Usage

```bash
# with pnpm
pnpm dlx create-react-swc-ts-extended@latest

# with npm
npx create-react-swc-ts-extended@latest

# with yarn
yarn dlx create-react-swc-ts-extended@latest
```

### Command Line Options

```
Arguments:
  [project-name]             Project name/folder to create

Options:
  --npm                      Use npm as package manager
  --pnpm                     Use pnpm as package manager
  --yarn                     Use yarn as package manager
  --pm <name>                Specify package manager (npm, pnpm, yarn)
  --git, -g                  Initialize git repository
  --no-git                   Skip git initialization
  --force, -f                Overwrite target directory if it exists
```

## Features

- React 19+ with TypeScript
- SWC for fast compilation
- Vite for dev server and bundling
- Vitest for unit testing
- Testing Library for React component tests
- TailwindCSS 3 for styling
- ESLint and Prettier for code quality
- Husky and lint-staged for git hooks

## Development

### Local Testing

To test the CLI locally:

1. Build the package:

   ```bash
   pnpm build
   ```

2. Link it globally:

   ```bash
   pnpm link --global
   ```

3. Run the CLI from anywhere:

   ```bash
   create-react-swc-ts-extended my-app --pnpm --git
   ```

4. Verify the generated project:
   ```bash
   cd my-app
   pnpm install
   pnpm dev
   ```

### Testing Workflow

For comprehensive testing, you can use the provided test scripts:

```bash
# Quick CLI test (creates a project and verifies it)
chmod +x test-cli.sh
./test-cli.sh

# Package installation test (tests npm, pnpm, and yarn)
chmod +x test-package.sh
./test-package.sh

# Thorough validation with error detection
chmod +x test-verification.sh
./test-verification.sh
```

The verification ensures that:

- TypeScript type checking works correctly
- ESLint catches linting issues
- Tests run successfully
- The project builds without errors

See [TESTING.md](./TESTING.md) for a complete testing checklist.

## License

MIT
