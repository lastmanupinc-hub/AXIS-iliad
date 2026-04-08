# ─── Cloudflare Pages — Deployment Configuration ────────────────
#
# Cloudflare Pages serves the static SPA from apps/web/dist/.
# Configure in the Cloudflare dashboard:
#
#   1. Connect GitHub repo: lastmanupinc-hub/Toolbox
#   2. Build settings:
#        Framework preset: None
#        Build command: pnpm install --frozen-lockfile && pnpm -r build
#        Build output directory: apps/web/dist
#        Root directory: /  (monorepo root)
#   3. Environment variables:
#        NODE_VERSION: 20
#        PNPM_VERSION: 10
#   4. Production branch: main
#
# ─── SPA Routing ─────────────────────────────────────────────────
#
# Cloudflare Pages auto-serves _redirects for SPA client-side routing.
# The _redirects file below is copied into the build output by the
# deploy workflow.
#
# ─── API Proxy ───────────────────────────────────────────────────
#
# In production, the web app calls the API at a separate origin.
# Set VITE_API_URL in the Cloudflare Pages environment variables
# to point to your Render API URL:
#
#   VITE_API_URL=https://axis-api.onrender.com
#
# The Vite dev proxy (/v1 → localhost:4000) only applies in
# development. In production, the web app uses VITE_API_URL
# (baked in at build time) to construct API requests.
