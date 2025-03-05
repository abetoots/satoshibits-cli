#!/bin/bash
# Script for testing the packaged CLI before publishing

set -e # Exit on any error

# Build the package
echo "Building package..."
pnpm run build

# Pack it locally
echo "Creating tarball..."
PACKAGE_PATH=$(pnpm pack | tail -n 1)

# Create a temporary directory for testing
TEST_DIR="/tmp/package-test"
mkdir -p $TEST_DIR
cp $PACKAGE_PATH $TEST_DIR/
cd $TEST_DIR
echo "Testing in $TEST_DIR"

# Function to verify a generated project
verify_project() {
  local project_dir=$1
  local pkg_manager=$2
  
  echo "Verifying project in $project_dir with $pkg_manager..."
  cd "$project_dir"
  
  # Run the main verification commands
  echo "Running typecheck..."
  $pkg_manager run typecheck
  
  echo "Running lint..."
  $pkg_manager run lint
  
  echo "Running tests..."
  $pkg_manager run test
  
  # Additional verification (build)
  echo "Verifying build..."
  $pkg_manager run build
  
  echo "✅ All verification passed for $project_dir"
  cd ..
}

# Test with npm
echo "Testing with npm..."
mkdir -p npm-test
cd npm-test
npm i ../$PACKAGE_PATH
npx create-react-swc-ts-extended my-npm-project --npm --git
cd my-npm-project
npm install
verify_project "$(pwd)" "npm"
cd ../..

# Test with pnpm
echo "Testing with pnpm..."
mkdir -p pnpm-test
cd pnpm-test
pnpm i ../$PACKAGE_PATH
pnpm exec create-react-swc-ts-extended my-pnpm-project --pnpm --git
cd my-pnpm-project
pnpm install
verify_project "$(pwd)" "pnpm"
cd ../..

# Test with yarn if available
if command -v yarn &> /dev/null; then
  echo "Testing with yarn..."
  mkdir -p yarn-test
  cd yarn-test
  yarn add ../$PACKAGE_PATH
  yarn create-react-swc-ts-extended my-yarn-project --yarn --git
  cd my-yarn-project
  yarn install
  verify_project "$(pwd)" "yarn"
  cd ../..
fi

echo "-----------------------------------"
echo "Package test complete! All verification passed!"
echo "Generated projects in:"
echo "- $TEST_DIR/npm-test/my-npm-project"
echo "- $TEST_DIR/pnpm-test/my-pnpm-project"
if command -v yarn &> /dev/null; then
  echo "- $TEST_DIR/yarn-test/my-yarn-project"
fi
echo "-----------------------------------"
