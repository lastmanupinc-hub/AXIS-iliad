#!/usr/bin/env bash
# Local CI — the verification gate now that GitHub Actions is unfunded.
# Mirrors .github/workflows/reusable-test-suite.yml via docker-compose.ci.yml.
#
#   scripts/ci-local.sh          full run (key scan → install → build → tests → tsc → lint → freshness)
#
# Exit code is the suite's exit code; "LOCAL CI GREEN" on stdout is the pass marker.
set -euo pipefail
cd "$(dirname "$0")/.."

# The key scan first, on the host (the container never sees the key file): no key-file value of 12+ characters in a
# tracked file (scripts/check-no-keys.mjs; eng.secrets, 2026-11-04). It prints only `label -> file`.
node scripts/check-no-keys.mjs --tree

exec docker compose -f docker-compose.ci.yml up \
  --build --abort-on-container-exit --exit-code-from ci \
  --quiet-pull
