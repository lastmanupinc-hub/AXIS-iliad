#!/usr/bin/env bash
# Local CI — the verification gate now that GitHub Actions is unfunded.
# Mirrors .github/workflows/reusable-test-suite.yml via docker-compose.ci.yml.
#
#   scripts/ci-local.sh          full run (install → build → tests → tsc → lint → freshness)
#
# Exit code is the suite's exit code; "LOCAL CI GREEN" on stdout is the pass marker.
set -euo pipefail
cd "$(dirname "$0")/.."

exec docker compose -f docker-compose.ci.yml up \
  --build --abort-on-container-exit --exit-code-from ci \
  --quiet-pull
