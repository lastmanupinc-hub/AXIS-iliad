# Route Priority Map — axis-iliad

> Route-level SEO prioritization for crawl budget and sitemap configuration

## Project Overview

axis-iliad is a monorepo built with TypeScript using React. It contains 500 files across 9 top-level directories. It defines 278 domain models.

## Detected Stack

| Framework | Version | Confidence |
|-----------|---------|------------|
| React | ^19.1.0 | 95% |

## Sitemap Configuration

| Route | Priority | Changefreq | Index | Reason |
|-------|----------|------------|-------|--------|
| `/` | 1.0 | weekly | Yes | Homepage — highest priority |
| `/pricing` | 0.9 | monthly | Yes | Conversion page — high commercial intent |
| `/docs` | 0.7 | monthly | Yes | Documentation — long-tail SEO value |
| `/health` | 0.5 | monthly | Yes | Standard page |
| `/for-agents` | 0.5 | monthly | Yes | Standard page |
| `/portal/api/paid/config` | 0.5 | monthly | Yes | Standard page |
| `/performance` | 0.5 | monthly | Yes | Standard page |
| `/performance/reputation` | 0.5 | monthly | Yes | Standard page |
| `/accounts` | 0.5 | monthly | Yes | Standard page |
| `/accounts/` | 0.5 | monthly | Yes | Standard page |
| `/oauth/authorize` | 0.3 | yearly | No | Auth page — minimal SEO value |
| `/oauth/jwks` | 0.3 | yearly | No | Auth page — minimal SEO value |
| `/v1/health` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/admin/stats` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/admin/accounts` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/admin/activity` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/admin/mcp-usage` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/admin/revenue` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/llms.txt` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/.well-known/skills/index.json` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/docs.md` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/.well-known/axis.json` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/install` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/install/:platform` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/error-codes` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/snapshots/:snapshot_id` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/projects/:project_id/context` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/projects/:project_id/generated-files` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/db/stats` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/search/:snapshot_id/stats` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/docs` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/programs` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/seats` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/upgrade-prompt` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/funnel` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/webhooks` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/webhooks/:webhook_id/deliveries` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/github-token` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/billing/history` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/billing/proration` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/begin.yaml` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/continuation.yaml` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/projects/:project_id/generated-files/:file_path*` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/projects/:project_id/export` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/keys` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/usage` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/analytics/summary` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/credits` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/plans` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/changelog` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/subscription` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/credits/purchases` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/health/live` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/health/ready` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/metrics` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/snapshots/:snapshot_id/versions` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/snapshots/:snapshot_id/versions/:version_number` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/snapshots/:snapshot_id/diff` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| `/v1/account/quota` | 0.0 | never | No | API/asset/internal endpoint — noindex |
| *… 42 more* | | | | |

## Summary

- **Sitemap-candidate (GET) routes:** 102
- **Indexable:** 10
- **Noindex:** 92
- **Non-GET / API routes (excluded, see below):** 73

## API Routes (Excluded)

These routes should NOT appear in sitemap or be indexed:

- `POST /v1/accounts`
- `PATCH /v1/account`
- `DELETE /v1/account`
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
- `POST /v1/github/architecture-drift`
- `POST /v1/account/tier`
- `DELETE /v1/account/github-token/:token_id`
- `POST /v1/account/keys`
- `POST /v1/account/keys/:key_id/revoke`
- `POST /v1/account/credits`
- `POST /v1/webhooks/stripe`
- `POST /v1/account/subscription/cancel`
- `POST /purchase`
- `POST /v1/prepare-for-agentic-purchasing`
- `POST /v1/research/scrape`
- `POST /v1/research/crawl`
- `POST /v1/account/analytics/events`
- `POST /v1/github/webhook`
- `POST /v1/projects/:project_id/memory`
- `POST /oauth/token`
- `POST /oauth/introspect`
- `POST /v1/auth/exchange`
- `POST /v1/auth/session`
- `POST /v1/auth/logout`
- `POST /portal/api/subscribe`
- `GET /portal/api/paid/config`
- `POST /portal/api/paid/webhook`
- `POST /v1/closer/generate`
- `POST /v1/deploy/generate`
- `POST /mcp/`
- `POST /v1/mcp`
- `POST /v1/mcp/`
- `POST /mcp/sse`
- `POST /mcp/mcp/*`
- `DELETE /mcp/mcp/*`
- `POST /accounts`
- `POST /v1/credits/topup`

## robots.txt Recommendations

```
User-agent: *
Allow: /
Disallow: /.well-known/agent-card.json
Disallow: /.well-known/agent.json
Disallow: /.well-known/ai-plugin.json
Disallow: /.well-known/axis.json
Disallow: /.well-known/capabilities.json
Disallow: /.well-known/glama.json
Disallow: /.well-known/mcp.json
Disallow: /.well-known/oauth-authorization-server
Disallow: /.well-known/oauth-protected-resource
Disallow: /.well-known/security.txt
Disallow: /.well-known/skills/index.json
Disallow: /.well-known/x402
Disallow: /.well-known/x402.json
Disallow: /accounts
Disallow: /agents.json
Disallow: /begin.yaml
Disallow: /continuation.yaml
Disallow: /favicon.ico
Disallow: /llms.txt
Disallow: /mcp
Disallow: /mcp/.well-known/agent.json
Disallow: /mcp/.well-known/mcp.json
Disallow: /mcp/docs
Disallow: /mcp/mcp
Disallow: /mcp/sse
Disallow: /oauth/authorize
Disallow: /oauth/introspect
Disallow: /oauth/jwks
Disallow: /oauth/token
Disallow: /openapi.json
Disallow: /portal/api/paid/config
Disallow: /portal/api/paid/webhook
Disallow: /portal/api/subscribe
Disallow: /probe-intent
Disallow: /purchase
Disallow: /robots.txt
Disallow: /sitemap.xml
Disallow: /v1/account
Disallow: /v1/account/analytics/events
Disallow: /v1/account/analytics/summary
Disallow: /v1/account/credits
Disallow: /v1/account/fleet
Disallow: /v1/account/funnel
Disallow: /v1/account/github-token
Disallow: /v1/account/keys
Disallow: /v1/account/programs
Disallow: /v1/account/quota
Disallow: /v1/account/seats
Disallow: /v1/account/subscription
Disallow: /v1/account/subscription/cancel
Disallow: /v1/account/tier
Disallow: /v1/account/upgrade-prompt
Disallow: /v1/account/upgrade-prompt/dismiss
Disallow: /v1/account/usage
Disallow: /v1/account/usage/timeseries
Disallow: /v1/account/webhooks
Disallow: /v1/accounts
Disallow: /v1/admin/accounts
Disallow: /v1/admin/activity
Disallow: /v1/admin/mcp-usage
Disallow: /v1/admin/revenue
Disallow: /v1/admin/stats
Disallow: /v1/agentic-purchasing/generate
Disallow: /v1/algorithmic/generate
Disallow: /v1/analyze
Disallow: /v1/artifacts/generate
Disallow: /v1/auth/exchange
Disallow: /v1/auth/github
Disallow: /v1/auth/github/callback
Disallow: /v1/auth/google
Disallow: /v1/auth/google/callback
Disallow: /v1/auth/logout
Disallow: /v1/auth/session
Disallow: /v1/billing/history
Disallow: /v1/billing/proration
Disallow: /v1/brand/generate
Disallow: /v1/canvas/generate
Disallow: /v1/changelog
Disallow: /v1/closer/generate
Disallow: /v1/credits/packs
Disallow: /v1/credits/purchases
Disallow: /v1/credits/topup
Disallow: /v1/db/maintenance
Disallow: /v1/db/stats
Disallow: /v1/debug/analyze
Disallow: /v1/deploy/generate
Disallow: /v1/docs
Disallow: /v1/docs.md
Disallow: /v1/error-codes
Disallow: /v1/frontend/audit
Disallow: /v1/funnel/metrics
Disallow: /v1/github/analyze
Disallow: /v1/github/architecture-drift
Disallow: /v1/github/webhook
Disallow: /v1/health
Disallow: /v1/health/live
Disallow: /v1/health/ready
Disallow: /v1/install
Disallow: /v1/marketing/generate
Disallow: /v1/mcp
Disallow: /v1/mcp/provision
Disallow: /v1/mcp/server.json
Disallow: /v1/mcp/tools
Disallow: /v1/metrics
Disallow: /v1/notebook/generate
Disallow: /v1/obsidian/analyze
Disallow: /v1/optimization/analyze
Disallow: /v1/plans
Disallow: /v1/prepare-for-agentic-purchasing
Disallow: /v1/programs
Disallow: /v1/projects
Disallow: /v1/remotion/generate
Disallow: /v1/research/crawl
Disallow: /v1/research/scrape
Disallow: /v1/search
Disallow: /v1/search/export
Disallow: /v1/search/index
Disallow: /v1/search/query
Disallow: /v1/seo/analyze
Disallow: /v1/skills/generate
Disallow: /v1/snapshots
Disallow: /v1/stats
Disallow: /v1/superpowers/generate
Disallow: /v1/theme/generate
Disallow: /v1/webhooks/stripe

Sitemap: https://yoursite.com/sitemap.xml
```

## Route Handler Files

| File | Exports | Lines |
|------|---------|-------|
| `cloudflare-pages.md` | default | 45 |
| `apps/api/src/credit-pack-handlers.ts` | export async function handleListCreditPacks(, export async function handleCreateCreditTopup(, export async function handleListMyPurchases( | 161 |
| `apps/api/src/fleet-handlers.ts` | export const FLEET_SCAN_LIMIT = ..., export async function handleGetFleet(req: IncomingMessage, res: ServerResponse): Promise<void> { ... } | 98 |
| `apps/api/src/handlers.ts` | export async function assertSnapshotAccess(req: IncomingMessage, res: ServerResponse, snapshot: { ... }, export async function assertProjectAccess(req: IncomingMessage, res: ServerResponse, project_id: string): Promise<boolea, export const PROGRAM_OUTPUTS: Record<string, string[]> = ..., export function makeProgramHandler(program: string, defaultOutputs: string[]) { ... }, export const handleDebugAnalyze = ..., export const handleFrontendAudit = ..., export const handleSeoAnalyze = ..., export const handleOptimizationAnalyze = ..., export const handleThemeGenerate = ..., export const handleBrandGenerate = ..., export const handleSuperpowersGenerate = ..., export const handleMarketingGenerate = ..., export const handleNotebookGenerate = ..., export const handleObsidianAnalyze = ..., export const handleMcpProvision = ..., export const handleArtifactsGenerate = ..., export const handleRemotionGenerate = ..., export const handleCanvasGenerate = ..., export const handleAlgorithmicGenerate = ..., export const handleAgenticPurchasingGenerate = ..., export const handleCloserGenerate = ..., export const handleDeployGenerate = ..., export async function handleCreateSnapshot(, export async function handleGetSnapshot(, export async function handleDeleteSnapshot(, export async function handleDeleteProject(, export async function handleGetContext(, export async function handleGetGeneratedFiles(, export async function handleHealthCheck(, export async function handleDbStats( | 4954 |
| `apps/api/src/memory-handlers.ts` | export async function handleListMemory(, export async function handleAddMemory( | 162 |
| `apps/api/src/paid-handlers.ts` | export async function handlePaidSubscribe(, export async function handlePaidConfig(, export async function handlePaidWebhook( | 544 |
| `apps/api/src/projects-handlers.ts` | export async function handleListProjects(req: IncomingMessage, res: ServerResponse): Promise<void> { ... }, export async function handleListProjectSnapshots( | 110 |
| `apps/api/src/router.ts` | export class Router { ... }, export function sendJSON(res: ServerResponse, status: number, data: unknown) { ... }, export function sendError(, export const DEFAULT_MAX_BODY_BYTES = ..., export function getMaxBodyBytes(): number { ... }, export async function readBody(req: IncomingMessage, maxSizeOverride?: number): Promise<string> { ... }, export interface AppHandle { ... }, export function isShuttingDown(): boolean { ... }, export function scheduleBootMigrations(, export function createApp(router: Router, port: number): Server { ... } | 567 |
| `docs/web-plan/AUDIT-pages.md` | default | 54 |
| `apps/web/src/routes.tsx` | export type PageId = ..., export type RouteParams = ..., export interface NavContext { ... }, export interface RouteContext extends NavContext { ... }, export type NavGroup = ..., export const NAV_GROUPS: readonly NavGroup[] = ..., export interface NavEntry { ... }, export interface RouteDef { ... }, export const ROUTES: RouteDef[] = ..., export const AUTH_ONLY_PAGES: ReadonlySet<PageId> = ..., export function routeForPage(page: PageId): RouteDef { ... }, export function matchPattern(pattern: string, hash: string): RouteParams \| null { ... }, export interface RouteMatch { ... }, export function matchHash(rawHash: string): RouteMatch \| null { ... }, export function hashForPage(page: PageId, params: RouteParams = ..., export function routeFromPathname(pathname: string): RouteDef \| null { ... }, export function isRouteVisible(route: RouteDef, ctx: NavContext): boolean { ... }, export function navLabelFor(route: RouteDef, ctx: NavContext): string { ... }, export function tabLabelFor(route: RouteDef, ctx: NavContext): string { ... }, export function routeForShortcut(digit: number, ctx: NavContext): RouteDef \| null { ... }, export function ownsShortcut(route: RouteDef, ctx: NavContext): boolean { ... }, export type NavRouteDef = ..., export function visibleNavRoutes(ctx: NavContext): NavRouteDef[] { ... }, export function visibleRailRoutes(ctx: NavContext): NavRouteDef[] { ... }, export function visibleGroupRoutes(group: NavGroup, ctx: NavContext): NavRouteDef[] { ... } | 875 |

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

- **You are here:** `route-priority-map.md` — agent step 10 of 71.
- **Next:** `content-audit.md`.
- **To iterate:** re-read `begin.yaml` → `continuation.yaml`, take the highest-priority open candidate, complete + verify it, update `continuation.yaml`, then keep going.
