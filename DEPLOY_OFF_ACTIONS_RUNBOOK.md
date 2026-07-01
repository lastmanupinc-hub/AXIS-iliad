# Deploy Off‑Actions Runbook — Iliad (axis-iliad)

**Goal:** make Iliad ship **without depending on GitHub Actions minutes**. Web builds on
**Cloudflare Pages** from a connected Git repo; the API builds on **Render** from the repo
`Dockerfile`. GitHub Actions keeps running the **PR quality gate** (build/test/typecheck) and
keeps the old deploy jobs as a **manual break‑glass** — it just stops *shipping* on every push.

Why: the same failure that hit Foundry — a GitHub‑Actions‑driven build stalling when Actions
minutes were unfunded. Iliad currently ships **both** surfaces through Actions (a `wrangler`
deploy for web, and a `docker build → ghcr → Render pull` for the API), so an unfunded/disabled
Actions account would stop deploys. After this cutover, Cloudflare and Render listen to GitHub
**push webhooks directly** and deploy even with Actions fully dark.

> **Account note:** the image org is `lastmanupinc-hub`. If Foundry and Iliad share that GitHub
> account, Actions minutes are billed account‑wide — confirm the account is funded, or that they're
> separate accounts, independent of this cutover.

---

## Golden rule — DASHBOARD FIRST

The old Actions deploy path stays fully active until the **very last** step. Never merge the gated
repo changes (render.yaml flip, CI break‑glass) until **both** providers are confirmed building from
Git. Executed in this order, live shipping cannot break.

| Step | Who | Action | Reversible? |
|------|-----|--------|-------------|
| 0 | repo (PR‑A) | Merge prep: `packageManager` pin + docs. Inert for current deploys. | trivially |
| 1 | you (Cloudflare) | Connect `axis-web` to Git, confirm one green build. | disconnect Git |
| 2 | you (Render) | Switch `axis-api` to Git+Docker, confirm `/v1/health`. | switch back to Image |
| 3 | repo (PR‑B) | Flip `render.yaml` → `runtime: docker` **+** update `deployment.test.ts` (same PR). | `git revert` |
| 4 | repo (PR‑B) | Move CI deploy jobs to `workflow_dispatch` break‑glass. | `git revert` |
| 5 | you (cleanup) | Optional: remove unused GHCR cred in Render. Leave Actions secrets. | — |

PR‑A is mergeable **now**. PR‑B must merge **only after Steps 1–2 are confirmed green**.

---

## STEP 0 — Prep (PR‑A, safe to merge immediately)

Contents (already prepared):
- `package.json` → `"packageManager": "pnpm@10.33.0"` (the exact pnpm that wrote `pnpm-lock.yaml`;
  corepack‑enforced so every provider build resolves the same pnpm). Inert for the current Actions
  path (CI uses `pnpm/action-setup@v5 version:10`), and the API `Dockerfile` already runs
  `corepack prepare pnpm@10` — proven to still build (local `docker build .` passes).
- `cloudflare-pages.md` → corrected build settings (Node 22, pnpm 10.33.0, canonical `VITE_API_URL`).
- This runbook.

**Pre‑flight (already done by prep, re‑runnable):** on a clean checkout at the target commit,
`corepack enable && pnpm install --frozen-lockfile && pnpm -r build` succeeds and emits
`apps/web/dist/` including `dist/_redirects` and `dist/_headers`; and `docker build .` builds the API
image. The `_redirects` (`/* /index.html 200`) is what keeps SPA deep‑links from 404‑ing on hard
refresh — Vite copies `apps/web/public/` → `dist/` automatically.

---

## STEP 1 — Cloudflare Pages → Connect to Git

Reconfigure the **existing** `axis-web` project (it owns the `iliad.trustfabric.ai` domain — do **not**
create a new project).

1. Cloudflare dashboard → **Workers & Pages** → **axis-web** → **Settings** → **Build & deployments**.
2. **Connect to Git** → authorize the Cloudflare GitHub App for the `lastmanupinc-hub` org
   (this OAuth step can't be scripted) → select repo **`lastmanupinc-hub/axis-iliad`**.
3. **Production branch:** `main`.
4. **Build configuration** (exact values):
   - Framework preset: **None**
   - Root directory: **`/`** (repo root — *not* `apps/web`)
   - Build command: **`pnpm install --frozen-lockfile && pnpm -r build`**
   - Build output directory: **`apps/web/dist`**
5. **Environment variables** (add to **Production and Preview**):
   - `VITE_API_URL` = `https://api.iliad.trustfabric.ai`
   - `PNPM_VERSION` = `10.33.0`
   - `NODE_VERSION` = `22`
6. Trigger a build (Deployments → **Create deployment**, or push to a throwaway branch for a preview).

**Confirm before proceeding:**
- [ ] Build succeeds (fails fast — no more silent `continue-on-error` masking).
- [ ] `https://iliad.trustfabric.ai` serves the app.
- [ ] Deep link + hard refresh works: open `https://iliad.trustfabric.ai/docs`, reload → app loads
      (not a 404) → `_redirects` is in effect.
- [ ] Network calls target `https://api.iliad.trustfabric.ai`.
- [ ] Custom domain `iliad.trustfabric.ai` still attached (project‑level; do not detach/re‑add).

The old `wrangler` `deploy-web` job still runs on merges during this window — harmless (both write
the same project; latest wins).

---

## STEP 2 — Render → build `axis-api` from Git + Dockerfile

Reconfigure the **existing** `axis-api` service **in place** (keeps the service ID and the
`api.iliad.trustfabric.ai` CNAME). **Do not create a new service** — that would orphan the domain.

1. Render dashboard → **axis-api** → **Settings** → **Build & Deploy** / **Source**.
2. **Connect a repository** → authorize the Render GitHub App for `lastmanupinc-hub` → repo
   **`lastmanupinc-hub/axis-iliad`**, **Branch:** `main`.
3. Runtime/Environment = **Docker**. **Dockerfile Path:** `./Dockerfile`. **Docker Build Context:** `.`
   (repo root). Leave the Docker Command blank (Dockerfile `CMD` = `node apps/api/dist/server.js`).
4. Keep everything else unchanged: Health Check Path `/v1/health`, plan **starter**, region **oregon**,
   the `/data` disk (`axis-data`, 1 GB), and **all 26 env vars** (`DATABASE_URL`, `AXIS_TOKEN_KEY`,
   `PAID_*`, `STRIPE_*`, `GITHUB_*`, … — the `sync:false` secrets stay as‑is).
5. **Auto‑Deploy: Yes** (deploy on push to `main`).
6. **Manual Deploy → Deploy latest commit** (`main`). Watch the 3‑stage Dockerfile build on Render.

**Confirm before proceeding:**
- [ ] Build runs the Dockerfile and the service reaches healthy.
- [ ] `GET https://api.iliad.trustfabric.ai/v1/health` → `200`.
- [ ] `GET https://api.iliad.trustfabric.ai/v1/health/ready` passes (DB reachable).
- [ ] `api.iliad.trustfabric.ai` still resolves to the same service.

**Do NOT** stop the Actions `docker-build`/`deploy-api` jobs yet — GHCR `:latest` keeps building so a
fallback exists until Step 4 lands.

> Prefer the dashboard (**Path A**) for the *first* switch, not a Blueprint sync. A `render.yaml`
> `image → docker` sync before the repo is connected can fail the service. Use the Blueprint (Step 3)
> only to keep it as the source of truth *after* the dashboard switch is confirmed.

---

## STEP 3 — Flip the Blueprint (PR‑B, part 1 — merge only after Steps 1–2)

Single PR, both files in lockstep (or `deployment.test.ts` goes red on `main`):
- `render.yaml`: replace the 6‑line `runtime: image` + `image:`/`creds:` block with
  `runtime: docker` / `dockerfilePath: ./Dockerfile` / `dockerContext: .`. Keep name, plan, region,
  `healthCheckPath`, `numInstances`, all envVars, and the disk block.
- `apps/api/src/deployment.test.ts`: replace the "uses image runtime pulling from GHCR" assertion with
  one asserting `runtime: docker` + `dockerfilePath: ./Dockerfile`. Leave every other assertion.

`build-and-test` must be green before merge. Validate the exact Render Blueprint field names
(`dockerfilePath`/`dockerContext`) against current Render docs at apply time — the dashboard switch in
Step 2 is the safety net regardless.

---

## STEP 4 — CI deploy jobs → break‑glass (PR‑B, part 2 — merge LAST)

In `.github/workflows/ci.yml`:
- Add `workflow_dispatch:` to the top‑level `on:` (keep `push:[main]` and `pull_request:[main]` so the
  gate still runs).
- `docker-build`, `deploy-api`, `deploy-web`: change `if: github.ref == 'refs/heads/main'` →
  `if: github.event_name == 'workflow_dispatch'`.
- **Do not delete** the job bodies, secrets, the `Deploy API to Render` comment, or the
  `ghcr.io/lastmanupinc-hub/axis-api` references — `deployment.test.ts` asserts those strings, and the
  bodies are the break‑glass path.

Net after merge: push→`main` runs the ~3‑min gate only; Cloudflare + Render self‑deploy from Git;
the Actions deploy path survives as **Actions → CI → Run workflow** (manual).

Steps 3 and 4 can be one PR, merged only after Steps 1–2 are confirmed.

---

## STEP 5 — Cleanup (optional)

- Remove the now‑unused GHCR registry credential `ghcr-lastmanupinc` from Render (Registry Credentials).
- **Leave** the Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `RENDER_DEPLOY_HOOK_URL`) in place — they power the break‑glass jobs.

---

## Rollback (fast, no credential regeneration)

Everything is preserved (never deleted) through the cutover, so revert is: flip the dashboard source
back **+** `git revert` the gated PR(s).

- **Web:** Cloudflare `axis-web` → Settings → disconnect Git (or Auto‑deploy off). Redeploy via
  **Actions → CI → Run workflow** (the `wrangler` `deploy-web` break‑glass) — domain unaffected.
- **API:** Render `axis-api` → Settings → switch Source back to **Image**
  (`ghcr.io/lastmanupinc-hub/axis-api:latest`, cred `ghcr-lastmanupinc`), then Manual Deploy. Run the
  `docker-build` + `deploy-api` jobs via **Run workflow** if a fresh `:latest` is needed.
- **Repo:** `git revert` the PR‑B commits to restore `on: push:[main]` auto‑deploy and `runtime: image`.

---

## Watch‑items after cutover

- **pnpm pin:** first Git build on each provider must install the `9.0` lockfile with pnpm `10.33.0`
  (the `packageManager` pin + `PNPM_VERSION` guarantee it). If a provider ever rejects a `9.0` lock,
  it resolved the wrong pnpm — recheck the pin.
- **Monorepo coupling:** the Pages build runs the whole `pnpm -r build`; a failure in *any* workspace
  package fails the web deploy (same coupling the `wrangler` path had). Keep `pnpm -r build` green.
- **Fail‑fast:** the old `deploy-web` had `continue-on-error: true` (failures were silent). Cloudflare
  Git builds fail loudly — treat the first green build as authoritative.
- **Render build minutes:** a native monorepo Docker build is ~8–10 min; heavy merge volume could
  exceed Starter's free minutes. Monitor.
- **Never rename** the Pages project or the `axis-api` service — the custom domains (and the GitHub
  App OAuth callback `https://iliad.trustfabric.ai/install/github/callback`) are attached to them.
