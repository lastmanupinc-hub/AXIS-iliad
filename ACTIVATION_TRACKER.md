# Activation Workstream Tracker

> **Cross-session continuity file.** Claude reads this at the start of every session to
> resume without losing context. Keep it terse and current: update the **Status board** and
> append a **Session log** entry whenever something changes. Source of truth for *what's done*
> is this file; source of truth for *how to do the external steps* is
> [SETUP_PAID_STRIPE_MCP.md](SETUP_PAID_STRIPE_MCP.md).

**Goal:** get AXIS Iliad from $0 → first revenue. Diagnosis (2026-06-20): the code can take
money; it isn't earning because (a) the free funnel (`iliad-md`) was never published, (b) the
paid rails were never switched on in the dashboards, (c) there's no usage instrumentation to
see conversion. It's a distribution + activation + instrumentation problem, **not** a
payment-mechanism problem (Stripe + PAI'D + x402/MPP metering are already wired).

**Related docs:** [SETUP_PAID_STRIPE_MCP.md](SETUP_PAID_STRIPE_MCP.md) (external checklist) ·
`LAUNCH_RUNBOOK.md` · `STRIPE_CHANGES_REQUIRED.md` · memory `iliad-md-product-strategy`.

---

## Status board

Legend: ⬜ not started · 🔄 in progress · ✅ done · 🚧 blocked

### Code tasks (Claude does these in-repo)
| # | Task | Status | Notes |
|---|---|---|---|
| C1 | 3 missing MCP discovery routes (`ai-plugin.json`, `oauth-protected-resource`, `/agents.json`) + tests | ✅ | DONE 2026-06-20. Added `handleAiPlugin` + `handleOAuthProtectedResource` in `handlers.ts`; routes in `server.ts:215–230`; reused `handleAgentJson` for `/agents.json`. Tests: `well-known-handlers.test.ts` 79✅, `agent-discovery.test.ts` 64✅, tsc clean. **Not yet committed.** Optional follow-up: advertise the new routes in `server.json`/`agent.json` endpoints list. |
| C2 | `mcp_usage` persistence table + `trackMcpUsage()` wired into `logMcpCall()` | ✅ | DONE 2026-06-20 (owner's tracking note #9). migration v23 `mcp_usage` table + `peekDb()` in `db.ts`; new `mcp-usage-store.ts` (`recordMcpUsage` + `getMcpUsageWindows`/`getMcpUsageSummary`/`getMcpUsageNewVsReturning`/`getRecentMcpUsage`); exported from snapshots `index.ts`; `detectMcpSource()` + wiring in `mcp-server.ts` `logMcpCall` (try/catch, best-effort). Rebuilt `@axis/snapshots` dist. Tests: snapshots `mcp-usage-store.test.ts`+`db.test.ts` 41✅; api `mcp-server`+`budget-probe` **270/271** (1 fail = pre-existing Docker-on-Windows code-sandbox hang, UNRELATED). Fixed db.test version assertions (22→23) + exact table-list. tsc clean both pkgs. **Not committed.** Outcome/latency columns deferred (logMcpCall fires pre-dispatch). |
| C2.5 | surface mcp_usage via admin endpoint + AdminPage dashboard | ✅ | DONE 2026-06-20. `GET /v1/admin/mcp-usage` (`handleAdminMcpUsage` in `admin.ts`, behind `requireAdmin` = `ADMIN_API_KEY` gate; `?window_days=` clamp 1..365) → `{windows, summary, new_vs_returning}`. Registered in `server.ts`. Web: `getMcpUsage()` + `McpUsageResponse` in `apps/web/src/api.ts`; panel in `AdminPage.tsx` (call windows, unique/anon, new/returning, by-source + by-tool tables). Tests: `admin.test.ts` **27✅** (401/403/200/window-clamp). api+web tsc clean. SETUP doc: added `ADMIN_API_KEY` Render step. **Only the holder of `ADMIN_API_KEY` can see it; fails closed if unset.** |
| C3 | (later) per-program differential pricing | ⬜ | premature until C2 yields conversion data; today flat 50¢/15¢ |

### External tasks (owner does these — see SETUP_PAID_STRIPE_MCP.md)

> **Reconciled against live production 2026-07-27 (Phase T, ROI 0.4).** This board had gone
> stale in the *pessimistic* direction — it showed the whole revenue path as not-started while
> production was already serving payments, which made it useless for deciding anything. Status
> below is what a live probe actually proves, and nothing more.

| # | Track | Status | Blocks |
|---|---|---|---|
| E-A | Stripe products/prices + webhook | 🔄 **partly verified** | `GET /v1/health/ready` → `payment_rail: "live"`, which proves `STRIPE_SECRET_KEY` is a **live-mode** key (the status is derived from the `sk_live_`/`rk_live_` prefix). It does **not** prove products, prices, or `STRIPE_WEBHOOK_SECRET` are configured — those are dashboard state no external probe can see. |
| E-B | PAI'D merchant live + 2 secrets | ✅ **verified live** | `GET /portal/api/paid/config` → `{"configured":true}`, and that predicate requires base URL **AND** merchant/account id **AND** `PAID_API_KEY` all present (`packages/paid-client/src/index.ts:67-73`). |
| E-C | Render env + redeploy | ✅ **verified live** | Both probes above answer from production, so the service is deployed with its env populated. |
| E-D1 | npm publish `iliad-md` | ⬜ | funnel top. Confirmed still unpublished — **no `npm publish` step exists in any workflow, script, or the Makefile** (Phase T). |
| E-D2 | MCP registry publish | ⬜ | agent discovery. Do ROI 0.2 first — the advertised OpenAPI URL was 404ing until this sweep. |
| E-D3 | Glama + Smithery | ⬜ | discovery. Note `Dockerfile.glama` is broken (copies 4 workspace packages; the API needs 8) while the live listing advertises self-hosting from it. |
| E-D4 | GitHub App + Marketplace Action | ⬜ | 2nd funnel. **HOLD** per repo law rule 11. |

**What this reconciliation does NOT resolve:** the platform still cannot bill **recurring** revenue —
PAI'D's checkout is one-time-charge only (`mode: "payment"`; it 501s on `mode: "subscription"`), so
every "monthly" subscriber pays once and keeps the tier. That is the largest revenue gap and it is
`gated(external)` on PAI'D's roadmap, not on anything in this board. See ROI 1.1.

---

## Open decisions / blockers

- **✅ B1 PAI'D host — RESOLVED 2026-06-20 (no mismatch).** Probed both: `api.trustfabric.ai`
  is a CNAME onto the same Render service as `axis-pai-paid-api-main.onrender.com` (identical
  `/health` + root manifest, `service: "axis-pai-paid-api"`). `render.yaml` `PAID_API_BASE_URL`
  switched to the durable custom domain `https://api.trustfabric.ai/v1` (uncommitted edit).
  Remaining owner action: mirror that value in the Render dashboard + redeploy (dashboard env
  overrides the blueprint). Functionally optional — both URLs already hit the same backend.

---

## Key facts (so a fresh session doesn't re-discover them)

- Paid path: **Starter monthly → PAI'D hosted checkout**; **Starter annual + Pro + Growth →
  Stripe-direct**. PAI'D settles into Stripe. (`paid-handlers.ts`, commit `bcb97ab`)
- Metering: `meterMcpToolCredits()` → `consumeUsageCredits()` throws payment-required;
  `@axis/mpp` builds the x402/402 negotiation body. Free tools have grown well past the
  original "6 discovery tools" figure (WO-13 commerce engines + WO-14 network
  tokenization + the x402 `ping_payment` probe all added free entries since) — the real,
  non-drifting count is `FREE_MCP_TOOL_COUNT` in `mcp-tool-impls.ts` (derived from
  `FREE_TOOL_NAMES` filtered against real `MCP_TOOLS` registrations, currently 14); rest
  metered.
- Entitlements deny-by-default: `AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=false` in prod.
- Pricing: flat 50¢ standard / 15¢ lite for analysis; `iliad_*` infra tools 1–5¢; some free lite.
- Discovery routes registered in `server.ts:215–225`; handlers in `handlers.ts`; tests in
  `well-known-handlers.test.ts`. Constants from `counts.ts`.
- Build/test: `npm run build`, `npm test` (vitest from root). API pkg `@axis/api` v0.5.3.

---

## Session log (append-only; newest last)

### 2026-06-20 — session start
- Assessed owner's monetization transcript notes; wrote `SETUP_PAID_STRIPE_MCP.md` (external checklist).
- Diagnosis: distribution + activation + instrumentation, not payment plumbing.
- Set up this tracker + memory pointer.

### 2026-06-20 — C1 + C2 shipped (uncommitted)
- **C1 ✅** discovery routes (`ai-plugin.json`, `oauth-protected-resource`, `/agents.json`) + tests. 79+64 pass.
- **C2 ✅** `mcp_usage` persistence: migration v23, `peekDb()`, `mcp-usage-store.ts`, `detectMcpSource()`,
  wired into `logMcpCall`. Snapshots 41 pass; api 270/271 (1 fail = pre-existing Docker/Windows
  code-sandbox hang, unrelated). Rebuilt `@axis/snapshots` dist. tsc clean.
- Files touched: `apps/api/src/handlers.ts`, `server.ts`, `mcp-server.ts`, `well-known-handlers.test.ts`;
  `packages/snapshots/src/db.ts`, `db.test.ts`, `index.ts`, `mcp-usage-store.ts` (+test).

### 2026-06-20 — C2.5 shipped + C1/C2/C2.5 committed
- **C2.5 ✅** private dashboard: `GET /v1/admin/mcp-usage` behind `requireAdmin` (`ADMIN_API_KEY`
  gate) + AdminPage panel. `admin.test.ts` 27 pass; api+web tsc clean. Added `ADMIN_API_KEY` to SETUP.
- **Committed** on `feat/iliad-tool-console` (3 commits; owner's in-flight hygiene work left untouched
  in the working tree — `mcp-server.ts` was hunk-split so only my telemetry hunks were committed):
  - `f3b715b` feat(api): persist MCP usage telemetry in mcp_usage table (C2)
  - `3eb2d2a` feat(api): missing MCP discovery routes + private admin usage dashboard (C1 + C2.5)
  - `14e4eee` docs: activation tracker + paid/Stripe/MCP external setup checklist
- **Not pushed.** Owner's uncommitted hygiene files remain: `hygiene.ts(.test)`, `mcp-server.ts`
  (hygiene hunks), `mpp/src/index.ts`, `counts.ts`, `budget-probe/mcp-server/prepare-purchasing` tests.

> **Resume hint for next session:** C1/C2/C2.5 committed (not pushed). Remaining: **B1** (PAI'D host
> reconcile — see Open decisions; gather/confirm canonical host then one-line `render.yaml` fix), or
> start an external track from `SETUP_PAID_STRIPE_MCP.md`. Don't commit the owner's hygiene files.
> Known noise: the slow api suite hits a Docker-on-Windows code-sandbox timeout — ignore it.
