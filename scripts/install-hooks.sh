#!/usr/bin/env bash
# install-hooks.sh: install the key scan as a pre-commit in the hooks folder git runs in this checkout (and every
# worktree of it, which share that folder). It does NOT set core.hooksPath: that would also turn on .githooks/pre-push
# (the ship-flow push guard), which is the owner's call. The installed hook runs the committing checkout's own
# scripts/check-no-keys.mjs, so it updates with the branch.
set -euo pipefail
hooks="$(git rev-parse --git-common-dir)/hooks"
hp="$(git config core.hooksPath || true)"
[ -n "$hp" ] && { echo "core.hooksPath is set ($hp): git runs .githooks/pre-commit there already"; exit 0; }
mkdir -p "$hooks"
if [ -f "$hooks/pre-commit" ] && ! grep -q "check-no-keys" "$hooks/pre-commit"; then
  echo "a different pre-commit is installed at $hooks/pre-commit: add the line below to it by hand"
  echo '  node "$(git rev-parse --show-toplevel)/scripts/check-no-keys.mjs" || exit 1'
  exit 1
fi
cat > "$hooks/pre-commit" <<'HOOK'
#!/bin/sh
# Installed by scripts/install-hooks.sh: the key scan on every commit, from the committing checkout's own copy.
if [ -f "$(git rev-parse --show-toplevel)/scripts/check-no-keys.mjs" ]; then
  node "$(git rev-parse --show-toplevel)/scripts/check-no-keys.mjs" || {
    echo "commit refused: a key value is in a staged file (labels above). Take it out; never commit it."; exit 1; }
else
  echo "pre-commit: scripts/check-no-keys.mjs is not in this checkout yet; the key scan did not run" >&2
fi
HOOK
chmod +x "$hooks/pre-commit"
echo "installed $hooks/pre-commit (the key scan, scripts/check-no-keys.mjs)"
