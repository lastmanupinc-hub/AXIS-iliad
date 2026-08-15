#!/usr/bin/env bash
# ship.sh — the garage doctrine, as a command (owner directive, 2026-08-15):
#   GitHub is a garage, not a CI/CD. Verification happens HERE. Deploys are
#   pushed FROM here and WATCHED to completion — never trusted to silence.
#
# Born from an 8-day incident: three Render builds failed silently (a committed
# sibling-repo file: dep no clone could resolve) while GH Actions was red and
# unfunded, and nothing paged. Every design choice below is that incident,
# inverted: local gates before push, push lands in BOTH the garage and the
# local mirror (double-pushurl on origin), and the deploy is polled via
# Render's own API until it reports live or failed — the only two honest
# endings a deploy has.
#
# Usage:
#   scripts/ship.sh api        gate -> push -> watched Render deploy (git-backed)
#   scripts/ship.sh web        build+prerender+audit -> wrangler pages deploy
#   scripts/ship.sh probe      run the live-probe battery against production
#   scripts/ship.sh gate       just the local gates (ci-local.sh if docker is up,
#                              else the non-container set: frozen-lockfile,
#                              build, tsc, lint)
#
# FUTURE (gated on two owner decisions — registry choice, and converting the
# Render service from git-backed to image-backed in render.yaml/dashboard):
#   scripts/ship.sh api --image   docker build -> push image -> Render pulls it.
#   At that point Render never builds anything again and GitHub leaves the
#   deploy path entirely.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ESTATE="$(cd "$ROOT/.." && pwd)"
SERVICE_ID="srv-d7c2hi28qa3s738ouftg"

# Secrets come from the estate key file at call time and are never echoed.
key() { grep -m1 "^$1" "$ESTATE/key.txt" | sed -E "s/^$1[[:space:]]*[:=][[:space:]]*//" | tr -d '\r" '; }

gate() {
  cd "$ROOT"
  if docker info >/dev/null 2>&1; then
    echo "[gate] docker engine up — running the full container gate"
    bash scripts/ci-local.sh
  else
    echo "[gate] docker engine DOWN — running the non-container gates"
    echo "[gate] (this is the degraded mode that shipped the Aug-15 prod fix;"
    echo "[gate]  frozen-lockfile is the exact step Render dies on)"
    pnpm install --frozen-lockfile
    pnpm run build
    pnpm -r exec tsc --noEmit
    pnpm lint
  fi
}

watch_deploy() {
  local rk; rk="$(key RENDER_API_KEY)"
  [ -n "$rk" ] || { echo "[watch] RENDER_API_KEY missing from key.txt"; exit 1; }
  local expect_sha="$1"
  echo "[watch] polling Render until live/failed (sha $expect_sha)"
  for i in $(seq 1 40); do
    sleep 25
    local status
    status="$(curl -sS --max-time 20 -H "Authorization: Bearer $rk" \
      "https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=1" |
      node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log((a[0]?.deploy?.status||'?')+' '+(a[0]?.deploy?.commit?.id||'').slice(0,7))})")"
    echo "  [$i] $status"
    case "$status" in
      "live $expect_sha"*) echo "[watch] DEPLOY LIVE"; return 0 ;;
      *failed*|*canceled*) echo "[watch] DEPLOY FAILED — logs: https://dashboard.render.com/web/$SERVICE_ID"; return 1 ;;
    esac
  done
  echo "[watch] gave up after ~17min — check the dashboard"; return 1
}

case "${1:-}" in
  api)
    gate
    cd "$ROOT"
    sha="$(git rev-parse --short HEAD)"
    echo "[api] pushing (lands in garage AND local mirror via double-pushurl)"
    # SHIP=1 satisfies .githooks/pre-push when the owner activates hook
    # enforcement — this is the one push path that WATCHES its deploy.
    SHIP=1 git -c http.postBuffer=157286400 push origin main
    watch_deploy "$sha"
    ;;
  web)
    cd "$ROOT/apps/web"
    npx tsc -b && npx vite build && npm run seo:prerender && npm run seo:audit
    export CLOUDFLARE_API_TOKEN; CLOUDFLARE_API_TOKEN="$(key CLOUDFLARE_ADMIN_API_KEY)"
    export CLOUDFLARE_ACCOUNT_ID="8f68bfe59d4bb0884986f7abe9832738"
    cd "$ROOT"
    npx wrangler@3 pages deploy apps/web/dist --project-name=axis-web --commit-dirty=true
    ;;
  probe)
    cd "$ROOT" && node scripts/live-probe.mjs
    ;;
  gate)
    gate
    ;;
  *)
    echo "usage: scripts/ship.sh {api|web|probe|gate}"; exit 2
    ;;
esac
