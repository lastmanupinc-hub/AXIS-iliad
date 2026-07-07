Audit complete. Below is the full API-surface audit of `apps/api/src/server.ts` (148 registered endpoints, API v0.5.3) mapped against the 14 target pages.

## Auth model (applies to all tables)

- **Public** = no auth. **Key** = `Authorization: Bearer <api_key>` or `X-Axis-Key` or HttpOnly cookie `axis_session` (set by `POST /v1/auth/session` / `/v1/auth/exchange` — per H1 memory, web must use the cookie, never localStorage). **Admin** = `ADMIN_API_KEY` env compared constant-time (`requireAdmin` / `isAdminCaller`).
- Errors are structured `sendError` JSON (`{error, message, ...details}`); paid programs return 402 with an MPP/x402 negotiation payload the UI must render.

## 1. Landing / Hero

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /` | public | name, version, endpoint/program/generator counts | EXISTS |
| `GET /v1/stats` | public | mcp_calls_today/total, top_tools (social proof) | EXISTS |
| `GET /v1/plans` | public | `{plans: PLAN_CATALOG, features}` | EXISTS |
| `POST /v1/analyze` (anonymous) | public | live demo — free programs only for anon | EXISTS |
| `GET /v1/health` | public | status/version/timestamp | EXISTS |

## 2. Login / Signup / API-key management

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `POST /v1/accounts` (alias `POST /accounts`) | public | account + one-time `raw_key` (auto-created "default" key); paid-tier signup 402-gated | EXISTS |
| `GET /v1/auth/github` + `/callback`, `GET /v1/auth/google` + `/callback` | public | 302 to provider; callback 302s to `AXIS_WEB_URL` with one-time code | EXISTS |
| `POST /v1/auth/exchange` `{code}` | public | sets `axis_session` HttpOnly cookie + `{api_key}` | EXISTS |
| `POST /v1/auth/session` `{api_key}` | public | sets cookie, `{ok:true}` | EXISTS |
| `POST /v1/auth/logout` | public | clears cookie | EXISTS |
| `POST /v1/account/keys`, `GET /v1/account/keys`, `POST /v1/account/keys/:key_id/revoke` | Key | create (one-time raw_key) / list (prefix, active) / revoke | EXISTS |
| Email+password login, email verification, password reset | — | — | **MISSING** (OAuth or key-paste only) |

## 3. Dashboard overview

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /v1/account` | Key | account, entitlements, usage_credits, quota block | EXISTS |
| `GET /v1/account/usage?since=` | Key | per-program aggregates + totals | EXISTS |
| `GET /v1/account/quota` | Key/public | rate_limit window + resource_quota | EXISTS |
| `GET /v1/account/funnel?limit=` | Key | stage + recent_events | EXISTS |
| `GET /v1/account/upgrade-prompt` (+ `POST .../dismiss`) | Key | contextual upsell | EXISTS |
| `GET /v1/account/fleet` | Key (paid/suite, ≥2 projects) | cross-project report | EXISTS |
| **List recent projects** | — | — | **MISSING — no `GET /v1/projects`** (biggest gap; `listProjectsByAccount` exists in @axis/snapshots but is only wired to fleet) |

## 4. Analyze Repo

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `POST /v1/analyze` `{github_url \| files[], programs?, token?, inline_content?}` | public/Key | one-call snapshot+context+artifacts; 402 for paid programs | EXISTS |
| `POST /v1/github/analyze` `{github_url, token?}` | public/Key | 201 snapshot_id, project_id, context_map, repo_profile, generated_files[], github meta | EXISTS |
| `POST /v1/snapshots` `{manifest, files[]}` | public/Key | 201 same shape + compliance_grade; tier file-count/size limits (413), pro-output 402 | EXISTS |
| `GET /v1/programs` | public | program → outputs map (program selector) | EXISTS |
| `GET /v1/account/github-token` | Key | stored tokens (private repos auto-used) | EXISTS |
| `X-Agent-Budget` / `X-Agent-Mode: lite` headers | — | reduced pricing | EXISTS |
| Multipart/ZIP upload intake | — | — | **MISSING** (JSON `files[]` only; browser must unzip client-side) |
| Async job status / progress (SSE or polling) | — | — | **MISSING** (processing is synchronous in-request) |

## 5. Project / Snapshot detail

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /v1/snapshots/:id` | owner-or-anon-snapshot | manifest, status, file_count, compliance_grade | EXISTS |
| `GET /v1/projects/:id/context` | owner | latest snapshot's context_map + repo_profile (architecture summary lives here) | EXISTS |
| `GET /v1/snapshots/:id/versions` | owner | version list + count | EXISTS |
| `GET /v1/snapshots/:id/versions/:n` | owner | full version | EXISTS |
| `GET /v1/snapshots/:id/diff?old=N&new=M` | owner | diff; **charges 1 persistence credit for paid/suite → handle 402 `persistence_credits_required`** | EXISTS |
| `GET/POST /v1/projects/:id/memory` | owner (account-owned projects only, 403 for anon projects) | memory entries | EXISTS |
| `DELETE /v1/snapshots/:id`, `DELETE /v1/projects/:id` | owner | `{deleted:true}` | EXISTS |
| List snapshots per project (`GET /v1/projects/:id/snapshots`) | — | — | **MISSING** (all project reads hardcode "latest snapshot") |

## 6. Artifact Explorer

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /v1/projects/:id/generated-files` | owner | full files[] with inline content + skipped[] (client-side tree/filter feasible) | EXISTS |
| `GET /v1/projects/:id/generated-files/:file_path*` | owner | raw content, correct Content-Type (preview) | EXISTS |
| `GET /v1/projects/:id/export?program=` | owner | ZIP (zero-dep builder; full pack weaves memory/delta/funnel/autonomy-loop) | EXISTS |
| `POST /v1/search/export` | snapshot owner | search-program files | EXISTS |
| Server-side artifact search; per-snapshot (non-latest) artifact fetch | — | — | **MISSING** (latest-only; filter client-side) |

## 7. Program Runner

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `POST /v1/{skills\|debug}/...` + `POST /v1/search/export` | public (free programs) | `{snapshot_id, program, files[], skipped}` | EXISTS |
| `POST /v1/{frontend,seo,optimization,theme,brand,superpowers,marketing,notebook,obsidian,mcp,artifacts,remotion,canvas,algorithmic,agentic-purchasing,closer,deploy}/...` (17 paid, via `makeProgramHandler`) | Key + entitlement/MPP charge | same shape; 401 anon, 402 with payment payload | EXISTS |
| `POST /v1/search/index`, `POST /v1/search/query`, `GET /v1/search/:snapshot_id/stats`, `/symbols` | snapshot owner | content search | EXISTS |
| `POST /v1/research/scrape`, `POST /v1/research/crawl` | Key | Firecrawl proxy | EXISTS |
| Live/streaming output | — | — | **MISSING** (all synchronous JSON) |

## 8. MCP Configuration

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /.well-known/mcp.json`, `GET /v1/mcp/server.json` | public | server manifest (`getMcpServerMeta`) | EXISTS |
| `GET /v1/mcp/tools?q=&program=` | public | tool registry search (35 tools) | EXISTS |
| `GET /mcp/docs` | public | HTML quick-start | EXISTS |
| `GET /.well-known/{axis,capabilities,agent,glama,ai-plugin}.json`, `/for-agents`, `/llms.txt`, `/.well-known/skills/index.json` | public | discovery manifests | EXISTS |
| `GET /v1/install`, `GET /v1/install/:platform` | public | per-client install config snippets | EXISTS |
| `POST /mcp` (+ aliases `/v1/mcp`, trailing-slash) | tool-level auth | JSON-RPC transport | EXISTS |

## 9. Agentic Purchasing / Commerce

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `POST /v1/agentic-purchasing/generate` | Key (paid) | playbook, product-schema, checkout-flow, negotiation-rules, commerce-registry, ap2-interop artifacts | EXISTS |
| `POST /v1/prepare-for-agentic-purchasing` | Key | readiness score + kit | EXISTS |
| `POST /probe-intent` `{intent}` | public | tool routing suggestion | EXISTS |
| Checkout preview | — | rendered from generated artifacts via generated-files endpoints | EXISTS (no extra API) |

## 10. Usage & Billing

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /v1/account/usage`, `GET /v1/account/quota` | Key | aggregates | EXISTS |
| `GET /v1/billing/history` | Key | tier-change audit trail | EXISTS |
| `GET /v1/billing/proration?tier=` | Key | proration preview | EXISTS |
| `GET /v1/account/credits` | Key | balance, ledger(50), credit_costs, packs; auto-applies suite grant | EXISTS |
| `GET /v1/credits/packs` (public), `POST /v1/credits/topup` `{pack_id}` (Key → PAI'D hosted checkout), `GET /v1/credits/purchases` (Key) | mixed | credit-pack purchase flow | EXISTS |
| **`POST /portal/api/subscribe`** `{plan: monthly\|annual, plan_id?, email}` | public | **CANONICAL payment path (PAI'D)** — returns hosted `checkout_url` to redirect to; fulfilment async via `POST /portal/api/paid/webhook` | EXISTS |
| `GET /portal/api/paid/config` | public | PAI'D config probe (is checkout available) | EXISTS |
| `POST /v1/checkout` | Key | **LEGACY Stripe-direct** — per payment-architecture memory, do NOT build new UI on this; PAI'D path is canonical | EXISTS (legacy) |
| `GET /v1/account/subscription`, `POST /v1/account/subscription/cancel` | Key | subscription state / cancel | EXISTS |
| `POST /v1/account/tier` | Key | upgrades 402-gated (admin/self-serve flag only); downgrades self-serve | EXISTS |
| Time-bucketed usage for graphs | — | — | **MISSING** — `/v1/account/usage` is aggregate-only; `GET /v1/account/analytics/summary` exists but returns **403 unless ADMIN key**, so regular users cannot power usage graphs |

## 11. Projects / History

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| **`GET /v1/projects` (list all analyzed repos for account)** | — | — | **MISSING (critical)** |
| Quick actions: delete/export/context/memory per project | Key | see pages 5/6 | EXISTS |

## 12. Settings

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /v1/account` | Key | profile | EXISTS |
| API keys (create/list/revoke) | Key | see page 2 | EXISTS |
| Webhooks: `POST/GET /v1/account/webhooks`, `DELETE /:webhook_id`, `POST /:webhook_id/toggle`, `GET /:webhook_id/deliveries` | Key | webhook CRUD + delivery log | EXISTS |
| Seats: `POST/GET /v1/account/seats`, `POST /:seat_id/accept`, `POST /:seat_id/revoke` | Key (paid/suite) | team seats | EXISTS |
| GitHub tokens: `POST/GET /v1/account/github-token`, `DELETE /:token_id` | Key | stored encrypted, prefix-only listing | EXISTS |
| `POST /v1/account/programs` `{enable[],disable[]}` | Key (paid/suite) | entitlement toggles | EXISTS |
| Profile update (`PATCH /v1/account` name/email), account deletion | — | — | **MISSING** |

## 13. Documentation Hub

| Endpoint | Auth | Returns | Status |
|---|---|---|---|
| `GET /v1/docs`, `GET /openapi.json` | public | OpenAPI spec (embedded explorer source) | EXISTS |
| `GET /v1/docs.md` | public | plain-text docs | EXISTS |
| `GET /llms.txt`, `GET /mcp/docs`, `GET /.well-known/skills/index.json` | public | MCP/agent docs | EXISTS |
| Example artifacts endpoint | — | — | **MISSING** (ship static, or reuse a public demo project's generated-files) |

## 14. 404 / error states + BONUS

- API 404s/405s are structured JSON (router default + explicit `/mcp/sse` etc. handlers) — web-side rendering only. EXISTS.
- **Playground (no login):** `POST /v1/analyze` anon + `GET /v1/account/quota` (anon rate-limit display) — EXISTS.
- **Changelog:** `CHANGELOG.md` exists at repo root, but **no endpoint serves it — MISSING `GET /v1/changelog`**.
- **Status page:** `GET /v1/health`, `/v1/health/live`, `/v1/health/ready`, `/v1/metrics`, `/performance`, `/performance/reputation`, `/v1/stats` — EXISTS. (`/v1/db/stats` is admin-only.)
- **Admin page:** `GET /v1/admin/{stats,accounts,activity,mcp-usage,revenue}` — EXISTS, ADMIN_API_KEY only; `revenue` distinguishes `estimated_mrr_cents` vs `settled_mrr_cents`.
- **Instrumentation:** `POST /v1/account/analytics/events` (Key) — EXISTS for client event tracking.
- **Design-system dogfood:** theme program outputs `design-tokens.json`/`theme.css` per project via generated-files; no global brand-token endpoint (static import from repo `brand/` is the path).

## Net-new API work required (priority order)

1. **`GET /v1/projects`** — list account's projects (id, name, github_url, latest snapshot id/status/date). Blocks Dashboard "recent projects" and the entire Projects/History page. Backing query (`listProjectsByAccount`) already exists.
2. **`GET /v1/projects/:id/snapshots`** — enumerate snapshots per project (detail-page version history across snapshots; every current project read is latest-only).
3. **Per-account time-bucketed usage** (e.g. `GET /v1/account/usage/timeseries?bucket=day&since_days=30`) — usage graphs; or drop the `isAdminCaller` 403 on `/v1/account/analytics/summary` (it already scopes to the caller's own account_id).
4. **`GET /v1/changelog`** — serve repo `CHANGELOG.md`.
5. **`PATCH /v1/account`** (name/email) + **`DELETE /v1/account`** — Settings completeness.
6. **Async analyze job API or SSE progress** — Program Runner "live output" and large-repo UX; everything is synchronous today.
7. Optional: multipart/ZIP upload intake; per-snapshot generated-files (`GET /v1/snapshots/:id/generated-files`); public examples endpoint; password auth if classic login is required.

Key caveats for the web build: diff viewer must handle 402 `persistence_credits_required`; paid program runs must handle 402 MPP payload with upgrade CTA; subscribe flow must use `POST /portal/api/subscribe` → redirect to PAI'D `checkout_url` (never `POST /v1/checkout`); auth must ride the `axis_session` cookie via `POST /v1/auth/session`/`/v1/auth/exchange`.

Files audited: `apps/api/src/server.ts`, `handlers.ts`, `billing.ts`, `versions.ts`, `export.ts`, `funnel.ts`, `admin.ts`, `paid-handlers.ts`, `credit-pack-handlers.ts`, `stripe.ts`, `oauth.ts`, `memory-handlers.ts`, `fleet-handlers.ts`, `mcp-server.ts`, `counts.ts` (all under `C:\Users\lastm\No Fate Platform\AXIS Toolbox\`).