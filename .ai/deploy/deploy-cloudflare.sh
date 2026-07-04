#!/usr/bin/env bash
# AXIS deploy/deploy-cloudflare.sh — local build → Cloudflare deploy.
# 'auto' (the default) uses the detected stack's recommended target: containers.
# Pass 'pages' or 'containers' explicitly to override. Zero CF build minutes either way.

set -euo pipefail

cd "$(dirname "$0")/.."  # workspace root

PAGES_CFG="deploy/wrangler.pages.toml"
CONTAINERS_CFG="deploy/wrangler.containers.toml"

# Detected primary stack at generate time: node-server
# For repos that are both, delete the inapplicable wrangler config or pass --target.

TARGET="${1:-auto}"

case "$TARGET" in
  pages)        run_pages=1; run_containers=0 ;;
  containers)   run_pages=0; run_containers=1 ;;
  auto|"")      run_pages=0; run_containers=1 ;;
  *) echo "Usage: $0 [pages|containers|auto]" >&2; exit 2 ;;
esac

if [ "$run_pages" = "1" ] && [ -f "$PAGES_CFG" ]; then
  echo "▶ Cloudflare Pages deploy (static, target dir: dist/)"
  if [ ! -d "dist" ]; then
    echo "  Building..."
    npm run build
  fi
  npx wrangler pages deploy "dist/" --project-name="axis-iliad" --config="$PAGES_CFG"
  echo "✓ Pages deployed"
elif [ "$run_containers" = "1" ] && [ -f "$CONTAINERS_CFG" ]; then
  echo "▶ Cloudflare Containers deploy (backend)"
  echo "  wrangler will run docker locally to build deploy/Dockerfile, then push to CF's registry."
  npx wrangler deploy --config="$CONTAINERS_CFG"
  echo "✓ Container deployed"
else
  echo "ERROR: no usable wrangler config found in deploy/" >&2
  echo "  expected one of: $PAGES_CFG, $CONTAINERS_CFG" >&2
  exit 1
fi
