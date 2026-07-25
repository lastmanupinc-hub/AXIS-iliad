#!/usr/bin/env bash
# Full Axis' Iliad regeneration pipeline
# Usage: bash scripts/regenerate.sh
#   or:  pnpm regenerate
#
# Contract (post-9ff7363): the CLI writes every generated artifact under a
# bare path (Dockerfile, AGENTS.md, mcp/README.md, ...) directly into
# --output — there is no nested `.ai-output/.ai/` layout anymore. Those
# generated files are templates for the repos THIS TOOL analyzes, not for
# axis-iliad's own infra: copying them broadly over the repo root would
# clobber our real Dockerfile/Makefile/CI workflows and the live begin-loop
# state (begin.yaml/continuation.yaml) that this very pipeline runs under.
# Only .ai/ (the full self-dogfood mirror) and an explicit root allowlist
# are ever written to.

set -euo pipefail
cd "$(dirname "$0")/.."

# Confirmed 2026-07-25: the dogfood run DOES emit begin.yaml, continuation.yaml,
# Dockerfile, docker-compose.yml and Makefile (verified against real output —
# they are legitimate generated artifacts for repos this tool analyzes). They
# must land only in .ai/, never at the repo root. The root-copy loop below is
# the actual safety boundary: it can only ever touch names literally listed
# in ROOT_ALLOWLIST. This self-check guards THAT invariant — it fires at
# parse time, before any build or dogfood run, if a future edit ever adds a
# protected name to the allowlist (the shape of the 2026-07 data-loss bug).
PROTECTED_ROOT_FILES=(begin.yaml continuation.yaml Dockerfile docker-compose.yml Makefile render.yaml)
ROOT_ALLOWLIST=(AGENTS.md CLAUDE.md .cursorrules)

for f in "${ROOT_ALLOWLIST[@]}"; do
  for p in "${PROTECTED_ROOT_FILES[@]}"; do
    if [ "$f" = "$p" ]; then
      echo "ERROR: '$f' is in both ROOT_ALLOWLIST and PROTECTED_ROOT_FILES." >&2
      echo "       Refusing to run — fix this script before regenerating." >&2
      exit 1
    fi
  done
done

echo "Starting full Axis regeneration pipeline..."

echo "  Building packages..."
pnpm -r build

echo "  Running dogfood: repo-parser -> context-engine -> generator-core..."
rm -rf .ai-output
node apps/cli/bin/axis.js analyze . --output .ai-output

if [ ! -d .ai-output ] || [ -z "$(ls -A .ai-output 2>/dev/null)" ]; then
  echo "ERROR: dogfood produced no output (.ai-output missing or empty) —" >&2
  echo "       aborting before touching .ai/ or the repo root." >&2
  exit 1
fi

echo "  Refreshing .ai/ (full dogfood mirror)..."
rm -rf .ai
mkdir .ai
cp -r .ai-output/. .ai/

echo "  Refreshing root allowlist (${ROOT_ALLOWLIST[*]})..."
for f in "${ROOT_ALLOWLIST[@]}"; do
  if [ -e ".ai/$f" ]; then
    cp ".ai/$f" "./$f"
  fi
done

rm -rf .ai-output

echo "  Running tests..."
npx vitest run

echo "Full sync complete."
