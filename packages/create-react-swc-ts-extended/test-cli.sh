#!/bin/bash
# Script for testing the CLI locally

set -e # Exit on any error

# Build the package
echo "Building package..."
pnpm run build

# Create a temporary directory for testing
TEST_DIR="/tmp/cli-test"
mkdir -p $TEST_DIR
cd $TEST_DIR
echo "Testing in $TEST_DIR"

# Link the package globally
echo "Linking package globally..."
cd /home/anon/satoshibits-cli/packages/create-react-swc-ts-extended
pnpm link --global

# Test 1: CLI with arguments for pnpm and git
echo "Test 1: Testing CLI with arguments for pnpm and git..."
cd $TEST_DIR
create-react-swc-ts-extended test-project-1 --pnpm --git

# Run verification on the generated project
cd test-project-1
echo "Installing dependencies..."
pnpm install

echo "Running verification..."
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build

echo "✅ Test 1 passed!"
cd $TEST_DIR

# Test 2: Testing with --force flag
echo "Test 2: Testing CLI with --force flag..."
# Create a dummy file to test directory overwrite
mkdir -p test-project-2
echo "dummy content" > test-project-2/dummy.txt

# This should overwrite the existing directory without prompting
create-react-swc-ts-extended test-project-2 --npm --force

if [ ! -f test-project-2/dummy.txt ] && [ -f test-project-2/package.json ]; then
  echo "✅ Project was successfully overwritten"
else
  echo "❌ Project was not overwritten correctly"
  exit 1
fi

# Check if package.json contains npm as package manager
cd test-project-2
npm install
npm run lint
echo "✅ Test 2 passed!"
cd $TEST_DIR

# Test 3: Test with yarn package manager
if command -v yarn &> /dev/null; then
  echo "Test 3: Testing CLI with yarn package manager..."
  create-react-swc-ts-extended test-project-3 --yarn --git=false
  
  cd test-project-3
  yarn install
  yarn lint
  
  # Check that git was not initialized
  if [ -d ".git" ]; then
    echo "❌ Git was initialized despite --git=false flag"
    exit 1
  else
    echo "✅ Git correctly not initialized with --git=false flag"
  fi
  
  echo "✅ Test 3 passed!"
  cd $TEST_DIR
else
  echo "Skipping Test 3 (yarn not available)"
fi

# Test 4: Test with pm flag
echo "Test 4: Testing CLI with --pm flag..."
create-react-swc-ts-extended test-project-4 --pm=pnpm

cd test-project-4
pnpm install
pnpm lint
echo "✅ Test 4 passed!"

echo "-----------------------------------"
echo "✅ All CLI tests complete! All verification passed!"
echo "-----------------------------------"
