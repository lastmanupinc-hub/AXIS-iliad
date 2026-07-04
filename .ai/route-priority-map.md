# Route Priority Map — axis-iliad

> Route-level SEO prioritization for crawl budget and sitemap configuration

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 16 top-level directories. It defines 242 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Sitemap Configuration

| Route | Priority | Changefreq | Index | Reason |
|-------|----------|------------|-------|--------|
| `/` | 1.0 | weekly | Yes | Homepage — highest priority |
| `/pricing` | 0.9 | monthly | Yes | Conversion page — high commercial intent |
| `/mcp/docs` | 0.7 | monthly | Yes | Documentation — long-tail SEO value |
| `/docs` | 0.7 | monthly | Yes | Documentation — long-tail SEO value |
| `/llms.txt` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/skills/index.json` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/axis.json` | 0.5 | monthly | Yes | Standard page |
| `/for-agents` | 0.5 | monthly | Yes | Standard page |
| `/health` | 0.5 | monthly | Yes | Standard page |
| `/mcp` | 0.5 | monthly | Yes | Standard page |
| `/performance` | 0.5 | monthly | Yes | Standard page |
| `/performance/reputation` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/capabilities.json` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/mcp.json` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/security.txt` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/glama.json` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/agent.json` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/ai-plugin.json` | 0.5 | monthly | Yes | Standard page |
| `/agents.json` | 0.5 | monthly | Yes | Standard page |
| `/mcp/.well-known/mcp.json` | 0.5 | monthly | Yes | Standard page |
| `/mcp/.well-known/agent.json` | 0.5 | monthly | Yes | Standard page |
| `/robots.txt` | 0.5 | monthly | Yes | Standard page |
| `/sitemap.xml` | 0.5 | monthly | Yes | Standard page |
| `/openapi.json` | 0.5 | monthly | Yes | Standard page |
| `/mcp/` | 0.5 | monthly | Yes | Standard page |
| `/favicon.ico` | 0.5 | monthly | Yes | Standard page |
| `/mcp/sse` | 0.5 | monthly | Yes | Standard page |
| `/mcp/mcp/*` | 0.5 | monthly | Yes | Standard page |
| `/accounts` | 0.5 | monthly | Yes | Standard page |
| `/accounts/` | 0.5 | monthly | Yes | Standard page |
| `/.well-known/oauth-authorization-server` | 0.3 | yearly | No | Auth page — minimal SEO value |
| `/.well-known/oauth-protected-resource` | 0.3 | yearly | No | Auth page — minimal SEO value |
| `/oauth/authorize` | 0.3 | yearly | No | Auth page — minimal SEO value |
| `/oauth/jwks` | 0.3 | yearly | No | Auth page — minimal SEO value |
| `/v1/health` | 0.0 | never | No | API/internal route — noindex |
| `/v1/admin/stats` | 0.0 | never | No | API/internal route — noindex |
| `/v1/admin/accounts` | 0.0 | never | No | API/internal route — noindex |
| `/v1/admin/activity` | 0.0 | never | No | API/internal route — noindex |
| `/v1/admin/mcp-usage` | 0.0 | never | No | API/internal route — noindex |
| `/v1/admin/revenue` | 0.0 | never | No | API/internal route — noindex |
| `/v1/docs.md` | 0.0 | never | No | API/internal route — noindex |
| `/v1/install` | 0.0 | never | No | API/internal route — noindex |
| `/v1/install/:platform` | 0.0 | never | No | API/internal route — noindex |
| `/v1/snapshots/:snapshot_id` | 0.0 | never | No | API/internal route — noindex |
| `/v1/projects/:project_id/context` | 0.0 | never | No | API/internal route — noindex |
| `/v1/projects/:project_id/generated-files` | 0.0 | never | No | API/internal route — noindex |
| `/v1/db/stats` | 0.0 | never | No | API/internal route — noindex |
| `/v1/search/:snapshot_id/stats` | 0.0 | never | No | API/internal route — noindex |
| `/v1/docs` | 0.0 | never | No | API/internal route — noindex |
| `/v1/programs` | 0.0 | never | No | API/internal route — noindex |
| `/v1/account/seats` | 0.0 | never | No | API/internal route — noindex |
| `/v1/account/upgrade-prompt` | 0.0 | never | No | API/internal route — noindex |
| `/v1/account/funnel` | 0.0 | never | No | API/internal route — noindex |
| `/v1/account/webhooks` | 0.0 | never | No | API/internal route — noindex |
| `/v1/account/webhooks/:webhook_id/deliveries` | 0.0 | never | No | API/internal route — noindex |
| `/v1/account/github-token` | 0.0 | never | No | API/internal route — noindex |
| `/v1/billing/history` | 0.0 | never | No | API/internal route — noindex |
| `/v1/billing/proration` | 0.0 | never | No | API/internal route — noindex |
| `/v1/projects/:project_id/generated-files/:file_path*` | 0.0 | never | No | API/internal route — noindex |
| `/v1/projects/:project_id/export` | 0.0 | never | No | API/internal route — noindex |
| *… 32 more* | | | | |

## Summary

- **Total routes:** 92
- **Indexable:** 30
- **Noindex:** 62

## API Routes (Excluded)

These routes should NOT appear in sitemap or be indexed:

- `POST /v1/accounts`
- `POST /v1/snapshots`
- `POST /probe-intent`
- `POST /mcp`
- `POST /v1/analyze`
- `DELETE /v1/snapshots/:snapshot_id`
- `DELETE /v1/projects/:project_id`
- `POST /v1/db/maintenance`
- `POST /v1/search/index`
- `POST /v1/search/query`
- `POST /v1/debug/analyze`
- `POST /v1/account/seats`
- `POST /v1/account/seats/:seat_id/accept`
- `POST /v1/account/seats/:seat_id/revoke`
- `POST /v1/account/upgrade-prompt/dismiss`
- `POST /v1/account/webhooks`
- `DELETE /v1/account/webhooks/:webhook_id`
- `POST /v1/account/webhooks/:webhook_id/toggle`
- `POST /v1/account/programs`
- `POST /v1/account/github-token`
- `POST /v1/search/export`
- `POST /v1/skills/generate`
- `POST /v1/frontend/audit`
- `POST /v1/seo/analyze`
- `POST /v1/optimization/analyze`
- `POST /v1/theme/generate`
- `POST /v1/brand/generate`
- `POST /v1/superpowers/generate`
- `POST /v1/marketing/generate`
- `POST /v1/notebook/generate`
- `POST /v1/obsidian/analyze`
- `POST /v1/mcp/provision`
- `POST /v1/artifacts/generate`
- `POST /v1/remotion/generate`
- `POST /v1/canvas/generate`
- `POST /v1/algorithmic/generate`
- `POST /v1/agentic-purchasing/generate`
- `POST /v1/github/analyze`
- `POST /v1/account/tier`
- `DELETE /v1/account/github-token/:token_id`
- `POST /v1/account/keys`
- `POST /v1/account/keys/:key_id/revoke`
- `POST /v1/account/credits`
- `POST /v1/webhooks/stripe`
- `POST /v1/checkout`
- `POST /v1/account/subscription/cancel`
- `POST /purchase`
- `POST /v1/account/analytics/events`
- `POST /v1/github/webhook`
- `POST /v1/projects/:project_id/memory`
- `POST /v1/auth/exchange`
- `POST /v1/auth/session`
- `POST /v1/auth/logout`
- `POST /portal/api/subscribe`
- `GET /portal/api/paid/config`
- `POST /portal/api/paid/webhook`
- `POST /v1/prepare-for-agentic-purchasing`
- `POST /v1/closer/generate`
- `POST /v1/deploy/generate`
- `POST /v1/github/architecture-drift`
- `POST /v1/research/scrape`
- `POST /v1/research/crawl`
- `POST /mcp/`
- `POST /v1/mcp`
- `POST /v1/mcp/`
- `POST /mcp/sse`
- `POST /mcp/mcp/*`
- `DELETE /mcp/mcp/*`
- `POST /accounts`
- `POST /v1/credits/topup`
- `POST /oauth/token`
- `POST /oauth/introspect`

## robots.txt Recommendations

```
User-agent: *
Allow: /
Disallow: /.well-known/oauth-authorization-server
Disallow: /.well-known/oauth-protected-resource
Disallow: /oauth/authorize
Disallow: /oauth/jwks
Disallow: /v1/health
Disallow: /v1/admin/stats
Disallow: /v1/admin/accounts
Disallow: /v1/admin/activity
Disallow: /v1/admin/mcp-usage
Disallow: /v1/admin/revenue
Disallow: /v1/docs.md
Disallow: /v1/install
Disallow: /v1/install/:platform
Disallow: /v1/snapshots/:snapshot_id
Disallow: /v1/projects/:project_id/context
Disallow: /v1/projects/:project_id/generated-files
Disallow: /v1/db/stats
Disallow: /v1/search/:snapshot_id/stats
Disallow: /v1/docs
Disallow: /v1/programs
Disallow: /v1/account/seats
Disallow: /v1/account/upgrade-prompt
Disallow: /v1/account/funnel
Disallow: /v1/account/webhooks
Disallow: /v1/account/webhooks/:webhook_id/deliveries
Disallow: /v1/account/github-token
Disallow: /v1/billing/history
Disallow: /v1/billing/proration
Disallow: /v1/projects/:project_id/generated-files/:file_path*
Disallow: /v1/projects/:project_id/export
Disallow: /v1/account
Disallow: /v1/account/keys
Disallow: /v1/account/usage
Disallow: /v1/account/analytics/summary
Disallow: /v1/account/credits
Disallow: /v1/plans
Disallow: /v1/account/subscription
Disallow: /v1/health/live
Disallow: /v1/health/ready
Disallow: /v1/metrics
Disallow: /v1/snapshots/:snapshot_id/versions
Disallow: /v1/snapshots/:snapshot_id/versions/:version_number
Disallow: /v1/snapshots/:snapshot_id/diff
Disallow: /v1/account/quota
Disallow: /v1/account/fleet
Disallow: /v1/funnel/metrics
Disallow: /v1/mcp/server.json
Disallow: /v1/stats
Disallow: /v1/projects/:project_id/memory
Disallow: /v1/auth/github
Disallow: /v1/auth/github/callback
Disallow: /v1/auth/google
Disallow: /v1/auth/google/callback
Disallow: /portal/api/paid/config
Disallow: /v1/search/:snapshot_id/symbols
Disallow: /v1/mcp
Disallow: /v1/mcp/
Disallow: /v1/mcp/tools
Disallow: /v1/accounts
Disallow: /v1/accounts/
Disallow: /v1/credits/packs
Disallow: /v1/credits/purchases
Disallow: /api/

Sitemap: https://yoursite.com/sitemap.xml
```

## Route Handler Files

| File | Exports | Lines |
|------|---------|-------|
| `apps/api/src/credit-pack-handlers.ts` | export async function handleListCreditPacks(, export async function handleCreateCreditTopup(, export async function handleListMyPurchases( | 154 |
| `apps/api/src/fleet-handlers.ts` | export const FLEET_SCAN_LIMIT = ..., export async function handleGetFleet(req: IncomingMessage, res: ServerResponse): Promise<void> { ... } | 98 |
| `apps/api/src/handlers.ts` | export async function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { ... }, export const PROGRAM_OUTPUTS: Record<string, string[]> = ..., export function makeProgramHandler(program: string, defaultOutputs: string[]) { ... }, export const handleDebugAnalyze = ..., export const handleFrontendAudit = ..., export const handleSeoAnalyze = ..., export const handleOptimizationAnalyze = ..., export const handleThemeGenerate = ..., export const handleBrandGenerate = ..., export const handleSuperpowersGenerate = ..., export const handleMarketingGenerate = ..., export const handleNotebookGenerate = ..., export const handleObsidianAnalyze = ..., export const handleMcpProvision = ..., export const handleArtifactsGenerate = ..., export const handleRemotionGenerate = ..., export const handleCanvasGenerate = ..., export const handleAlgorithmicGenerate = ..., export const handleAgenticPurchasingGenerate = ..., export const handleCloserGenerate = ..., export const handleDeployGenerate = ..., export async function handleCreateSnapshot(, export async function handleGetSnapshot(, export async function handleDeleteSnapshot(, export async function handleDeleteProject(, export async function handleGetContext(, export async function handleGetGeneratedFiles(, export async function handleHealthCheck(, export async function handleDbStats(, export async function handleDbMaintenance( | 3825 |
| `apps/api/src/memory-handlers.ts` | export async function handleListMemory(, export async function handleAddMemory( | 162 |
| `apps/api/src/paid-handlers.ts` | export async function handlePaidSubscribe(, export async function handlePaidConfig(, export async function handlePaidWebhook( | 420 |
| `apps/api/src/router.ts` | export class Router { ... }, export function sendJSON(res: ServerResponse, status: number, data: unknown) { ... }, export function sendError(, export async function readBody(req: IncomingMessage): Promise<string> { ... }, export interface AppHandle { ... }, export function isShuttingDown(): boolean { ... }, export function scheduleBootMigrations(, export function createApp(router: Router, port: number): Server { ... } | 491 |
| `apps/web/src/components/ToolPage.tsx` | export interface ToolPricing { ... }, export interface ToolPageProps { ... }, export function ToolPage({ ... } | 189 |
| `apps/web/src/pages/AccountPage.tsx` | export function AccountPage({ ... } | 599 |
| `apps/web/src/pages/AdminPage.tsx` | export function AdminPage() { ... } | 334 |
| `apps/web/src/pages/DashboardPage.tsx` | export function DashboardPage({ ... } | 197 |

## Route Handler Example

### `cloudflare-pages.md`

```markdown
# ─── Cloudflare Pages — Deployment Configuration ────────────────
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
... (20 more lines)
```


---

## ⟳ Continue the loop

- **You are here:** `route-priority-map.md` — agent step 10 of 70.
- **Next:** `content-audit.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
