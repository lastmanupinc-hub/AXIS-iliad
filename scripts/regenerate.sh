#!/usr/bin/env bash
# Full AXIS Toolbox regeneration pipeline
# Usage: bash scripts/regenerate.sh
#   or:  pnpm regenerate

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Starting full Axis regeneration pipeline..."

# 1. Clean stale nested duplicates
rm -rf .ai/.ai/ 2>/dev/null || true

# 2. Build all packages
echo "  Building packages..."
pnpm -r build

# 3. Run CLI dogfood — generates all 86 artifacts
echo "  Running dogfood: repo-parser -> context-engine -> generator-core..."
node apps/cli/bin/axis.js analyze . --output .ai-output

# 4. Copy generated artifacts to their final locations
cp -r .ai-output/* .
cp -r .ai-output/.ai/* .ai/

# 5. Clean up temp output
rm -rf .ai-output

# 6. Run tests
echo "  Running tests..."
npx vitest run

echo "Full sync complete."
