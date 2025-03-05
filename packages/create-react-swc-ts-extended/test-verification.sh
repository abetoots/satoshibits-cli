#!/bin/bash
# Script for thorough validation of a generated project

set -e # Exit on any error

# Create a temporary directory for testing
TEST_DIR="/tmp/verification-test"
mkdir -p $TEST_DIR
cd $TEST_DIR
echo "Testing in $TEST_DIR"

# Build and link the package
echo "Building and linking package..."
cd /home/anon/satoshibits-cli/packages/create-react-swc-ts-extended
pnpm run build
pnpm link --global

# Generate a test project using CLI arguments
echo "Generating test project..."
cd $TEST_DIR
create-react-swc-ts-extended verification-project --pnpm --git

# Install dependencies
cd verification-project
echo "Installing dependencies..."
pnpm install

# Basic verification
echo "Running basic verification..."
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build

# Advanced validation - introduce and detect errors
echo "Running advanced validation (error detection)..."

# Create a file with lint errors
echo "Testing lint error detection..."
cat > src/lintTest.tsx << 'EOL'
function BadComponent() {
  var unused = 'this should trigger a lint error';
  return <div>Test</div>;
}
EOL
if pnpm run lint --quiet; then
  echo "❌ Lint failed to detect errors"
  exit 1
else
  echo "✅ Lint correctly detected errors"
fi

# Create a file with type errors
echo "Testing type error detection..."
cat > src/typeTest.tsx << 'EOL'
const TypeTest = () => {
  const str: string = 42; // This should trigger a type error
  return <div>{str}</div>;
}
EOL
if pnpm run typecheck; then
  echo "❌ Type checking failed to detect errors"
  exit 1
else
  echo "✅ Type checking correctly detected errors"
fi

# Create a failing test
echo "Testing test failure detection..."
cat > src/failTest.test.tsx << 'EOL'
import { describe, it, expect } from 'vitest';

describe('Failing test', () => {
  it('should fail', () => {
    expect(true).toBe(false);
  });
});
EOL
if pnpm run test --run; then
  echo "❌ Test runner failed to detect failing test"
  exit 1
else
  echo "✅ Test runner correctly detected failing test"
fi

# Clean up the failing code
rm src/lintTest.tsx src/typeTest.tsx src/failTest.test.tsx

echo "-----------------------------------"
echo "✅ Complete verification passed!"
echo "Project created successfully and all validation systems work correctly."
echo "-----------------------------------"
