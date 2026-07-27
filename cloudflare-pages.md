# ─── Cloudflare Pages — Deployment Configuration ────────────────
#
# ⚠ STATUS 2026-07-27: THIS SETUP WAS NEVER COMPLETED, AND NOTHING DEPENDS ON IT.
#
# Verified against Cloudflare's API: the `axis-web` Pages project has
# `source: null` — no Git connection exists. Every live deployment is an
# `ad_hoc` / `direct_upload`, i.e. the wrangler step in
# `.github/workflows/ci.yml`'s deploy-web job. That job is the SOLE deploy
# path for the web app and it is working (6 consecutive successes on
# 2026-07-27).
#
# So the Git-connect procedure below is an ALTERNATIVE that was planned and
# not adopted — not a description of how the site currently ships, and not an
# outstanding task. Following it would switch the build source and is a real
# behavioural change; do not treat it as "finishing the setup".
#
# (Consistent with the known constraint that Pages Git-connect is browser-only
# OAuth and cannot be scripted with the API token in key.txt.)
#
# Cloudflare Pages serves the static SPA from apps/web/dist/.
# Configure in the Cloudflare dashboard:
#
#   1. Connect GitHub repo: lastmanupinc-hub/axis-iliad
#        (Workers & Pages → project "axis-web" → Settings → Build & deployments
#         → Connect to Git. Reconfigure the EXISTING axis-web project — do NOT
#         create a new one; the iliad.trustfabric.ai custom domain is attached
#         at the PROJECT level and survives the build-source switch.)
#   2. Build settings (type these EXACT values):
#        Framework preset: None
#        Build command: pnpm install --frozen-lockfile && pnpm -r build
#        Build output directory: apps/web/dist
#        Root directory: /  (monorepo root — NOT apps/web, or pnpm -r cannot
#                            resolve the workspace)
#   3. Environment variables (set on BOTH Production and Preview):
#        VITE_API_URL: https://api.iliad.trustfabric.ai   (baked in at build time)
#        NODE_VERSION:  22                                 (matches CI)
#        PNPM_VERSION:  10.33.0                            (EXACT — see note below)
#   4. Production branch: main
#
# Note on PNPM_VERSION: the repo pins pnpm via the root package.json
# "packageManager": "pnpm@10.33.0" field (corepack-enforced). The lockfile
# header is lockfileVersion 9.0, which pnpm 10 reads natively. Pin the exact
# 10.33.0 so the Pages build's --frozen-lockfile install cannot drift.
#
# ─── SPA Routing ─────────────────────────────────────────────────
#
# Cloudflare Pages auto-serves _redirects for SPA client-side routing.
# apps/web/public/_redirects ("/* /index.html 200") and _headers are copied
# into apps/web/dist by Vite at build time (public/ → dist/), so a connected-
# Git build emits them exactly as the old wrangler build did.
#
# ─── API Origin ──────────────────────────────────────────────────
#
# In production the web app calls the API at a separate origin. VITE_API_URL
# (above) is baked into the bundle at build time. Canonical API host:
#
#   VITE_API_URL=https://api.iliad.trustfabric.ai
#
# (apps/web/src/api.ts also falls back to this exact host if the var is unset,
# but set it explicitly to match CI and survive a future domain change.)
# The Vite dev proxy (/v1 → localhost:4000) only applies in development.
