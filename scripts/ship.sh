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
#   scripts/ship.sh storefront build+verify -> wrangler pages deploy (preview project)
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
  storefront)
    # ext_02: this deploy previously had NO build-verification step at all —
    # `wrangler pages deploy .storefront-dist` was run by hand, and local HEAD
    # could sit ahead of what was actually live with nothing to catch it. This
    # case is that check: build for real, assert the Agent Readiness files and
    # every product page landed, THEN deploy — never deploy an unverified dist.
    cd "$ROOT"
    pnpm --filter @axis/generator-core build
    node scripts/build-storefront.mjs
    node -e '
      const fs = require("node:fs");
      const path = require("node:path");
      const dist = path.join(process.cwd(), ".storefront-dist");
      const registry = require("./packages/generator-core/dist/product-registry.js").PRODUCT_REGISTRY;
      const ids = Object.keys(registry);
      const fail = (msg) => { console.error("[storefront verify] FAIL: " + msg); process.exit(1); };
      const robots = fs.readFileSync(path.join(dist, "robots.txt"), "utf8");
      if (!/Content-Signal:/.test(robots)) fail("robots.txt missing Content-Signal directive");
      const llms = fs.readFileSync(path.join(dist, "llms.txt"), "utf8");
      for (const id of ids) {
        const p = registry[id];
        if (!llms.includes(`https://${p.subdomain}/`)) fail(`llms.txt missing ${id} (${p.subdomain})`);
        if (!fs.existsSync(path.join(dist, id, "index.html"))) fail(`${id}/index.html missing from dist`);
        if (!fs.existsSync(path.join(dist, `${id}-favicon.svg`))) fail(`${id}-favicon.svg missing from dist`);
      }
      console.log(`[storefront verify] OK — robots.txt, llms.txt, and all ${ids.length} product pages+favicons present`);
    '
    export CLOUDFLARE_API_TOKEN; CLOUDFLARE_API_TOKEN="$(key CLOUDFLARE_ADMIN_API_KEY)"
    export CLOUDFLARE_ACCOUNT_ID="8f68bfe59d4bb0884986f7abe9832738"
    npx wrangler@3 pages deploy .storefront-dist --project-name=axis-storefront --commit-dirty=true
    echo "[storefront] deployed — verify: curl -sS https://axis-storefront.pages.dev/robots.txt"
    ;;
  probe)
    cd "$ROOT" && node scripts/live-probe.mjs
    ;;
  gate)
    gate
    ;;
  *)
    echo "usage: scripts/ship.sh {api|web|storefront|probe|gate}"; exit 2
    ;;
esac
