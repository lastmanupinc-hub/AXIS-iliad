# Grok Handoff — Completing the Web Plan (WO-P9 → WO-P17)

**Audience:** a non-Claude coding agent (Grok) picking up the Iliad web-app build when the
current agent's weekly token budget runs out. Everything you need is in-repo; this file is the
map. Read this fully before writing code.

**Mission:** complete the remaining pages of `docs/web-plan/BUILD-PLAN.md` — WO-P9 through
WO-P17 — plus the two small API endpoints they depend on (WO-A4, WO-A5). WO-F1–F5 and
WO-P1–P8 are DONE and merged; do not rebuild or restyle them.

---

## Current state (verified against git, 2026-07-11)

| Landed | Commit |
|---|---|
| WO-F1 theme bridge | `6d1fd88` |
| WO-F2 route table + 404 | `c5fd02c` |
| WO-F3 API client + multi-project state | `b1696cc` |
| WO-F4 primitives + footer | `f22d4a7` |
| WO-F5 config.ts single-source counts | `9f6e959` |
| WO-P1 landing/hero + anon results | `5cf826c` |
| WO-P2 auth polish | `2d1a327` |
| WO-P3 account dashboard | `b6969ba` |
| WO-P4 analyze advanced options | `f6b1cf1` |
| WO-P5 project detail + versions + diff | `1236b11` |
| WO-P6 artifact explorer | `a187f41` |
| WO-P7 program runner | `5f7249b` |
| WO-P8 MCP configuration page | `2a60c10` |

**Remaining:** WO-P9 (Commerce hub), WO-P10 (Usage & Billing), WO-P11 (Projects list),
WO-P12 (Settings), WO-P13 (Docs hub + OpenAPI explorer), WO-P14 (404/a11y sweep),
WO-P15/P16/P17 (Playground, Changelog, Status — bonus tier), and API work-orders
**WO-A4** (`GET /v1/changelog`, blocks P16) and **WO-A5** (`PATCH /v1/account` +
`DELETE /v1/account`, blocks P12's account-deletion criterion). WO-A1/A2/A3 are already
live in `apps/api/src/server.ts` — verify with grep before assuming anything else is missing.

Each WO's spec, acceptance criteria, API mini-specs, and the Honesty Notes (H1–H11) live in
`docs/web-plan/BUILD-PLAN.md`. The three audits (`AUDIT-pages.md`, `AUDIT-api.md`,
`AUDIT-design.md`) are the ground truth the plan was written from. **The acceptance criteria
are the definition of done — build to them exactly.**

---

## Hard rules (violations get reverted)

1. **No new npm dependencies.** Hand-roll (SVG charts, diff views, markdown-lite already exist
   as primitives — reuse `apps/web/src/components/primitives/`).
2. **TypeScript strict; no class components** (the one existing `ErrorCatcher` in App.tsx is
   the only exception).
3. **PAI'D is the ONLY checkout path.** Never call or resurrect `POST /v1/checkout`
   (legacy Stripe-direct). Checkout = `getPaidConfig()` → `#paid-checkout` →
   `paidSubscribe()` → PAI'D hosted page. Customer-facing payment copy says
   "PAI'D Payments Intelligence" (Stripe may be mentioned only as the settlement rail in ToS).
4. **Cookie auth only.** Login state = HttpOnly `axis_session` cookie via
   `establishSession()`/`markAuthed()` (`apps/web/src/api.ts`). localStorage holds only the
   non-secret marker `"__cookie_session__"` under the `axis_api_key` key. NEVER store a raw
   API key in web storage.
5. **Count honesty.** Every displayed count (programs/artifacts/tools/endpoints) comes from
   `apps/web/src/config.ts` or a live API call — never a literal.
   `apps/api/src/count-honesty.test.ts` greps the web source and will fail CI if you inline one.
6. **No dead or fake UI.** No "coming soon" cards, no fabricated stats, no simulated
   streaming (programs are synchronous — show honest staged status; see WO-P7 for the
   pattern). Status page (P17) shows current health only — NO uptime history exists
   server-side; do not invent it (Honesty H4).
7. **Routing:** one entry per page in `apps/web/src/routes.tsx` (pattern, label, section,
   authOnly, render). Unknown hashes 404. Deep links use `:param` segments. Add pathname
   aliases only for marketing URLs.
8. **Hash-link hygiene:** every `href="#..."` and `window.location.hash =` must target a
   pattern that exists in routes.tsx. (A dead `#upload` link shipped once already — don't
   repeat it. Grep your new page for hash links and cross-check.)

## Sequencing

Build **WO-A4 and WO-A5 first** (small, unblock P16/P12), then P11 → P10 → P12 → P9 → P13 →
P14 → P15/P16/P17. One work-order per commit; message format
`feat(web): WO-Pn <name> — <what>` (or `feat(api): WO-An …`); disclose every deviation from
the plan text in the commit body.

## Build / test / verify (all from repo root)

```bash
pnpm install
pnpm run build                 # full monorepo — must be clean before any push
# Postgres-backed tests need the local container:
docker start axis-test-pg      # postgres on localhost:5433 (user/pass: postgres)
DATABASE_URL=postgres://postgres:postgres@localhost:5433/axis_test npx vitest run apps/web/src
DATABASE_URL=... npx vitest run apps/api/src/count-honesty.test.ts   # after ANY web copy change
```

- Run scoped suites, not the full monorepo run, locally (the full run is slow and two suites —
  `production-startup.test.ts`, `rate-limiter.test.ts` — are timeout-flaky under load; CI is
  the authoritative full run).
- `apps/web` has its own `tsc -b` + `vite build` via `pnpm --filter @axis/web build`.
- After committing: `git status --porcelain` must print nothing. Never leave work uncommitted.

## Deploy pipeline (why CI must stay green)

Push to `main` triggers: (a) Render auto-deploy of the API (Docker), and (b) GitHub Actions
`CI`, whose **deploy-web job publishes `apps/web/dist` to Cloudflare Pages only if
build-and-test passes**. A red CI = the web app silently stops shipping (this bit us for 4
days once — the `yaml` phantom-dependency incident). Check
`gh run list --branch main --limit 3` after every push; both `CI` and `Compliance Check`
must be green.

## Per-WO gotchas the plan text doesn't spell out

- **WO-A5 DELETE /v1/account:** spec the retention policy in the PR (recommend hard-delete,
  0-day grace for v1) and cascade keys/webhooks/tokens/seats. Add the endpoint to
  `apps/api/src/openapi.ts` and bump `ENDPOINT_COUNT` in `apps/api/src/counts.ts` — the
  counts-consistency test enforces this.
- **WO-P10 graphs:** `GET /v1/account/usage/timeseries` already exists (WO-A3). Use the
  `Sparkline`/`BarChart` primitives from WO-F4; consult `dataviz` conventions if available.
- **WO-P12 seats:** the backend is REAL (`/v1/account/seats*`) — move the existing
  AccountPage seat UI, don't rebuild it. Tier-gate honestly ("available on Paid/Suite").
- **WO-P9 commerce hub:** render only artifact-backed content (the generated playbook /
  negotiation-rules / checkout-flow files fetched via generated-files endpoints). The
  checkout "preview" is a visualization of the customer's generated flow, labeled as such —
  nothing executable (Honesty H3).
- **WO-P13 OpenAPI explorer:** hand-rolled from live `GET /openapi.json` — tag-grouped list,
  expandable params, copy-curl. No swagger-ui dependency.
- **WO-P14:** the a11y click-only-div list in the plan is partially stale — ArtifactExplorer
  (WO-P6) already fixed its rows; re-audit before fixing.
- **Wave-2 known UI bug already fixed on main:** ProjectPage re-syncs `activeTab` from
  `initialTab` on hashchange (browser back/forward). Don't regress it; if you add tabbed
  deep links elsewhere, copy that effect pattern.

## Out of scope for you

- Anything under `docs/github-app-plan/` (GitHub App/Marketplace work is ON HOLD by owner
  instruction).
- The `assetforge` repo (separate workstream, WO-17).
- Payments/settlement internals (`cashier.ts`, `mcp-runtime.ts`, `mpp.ts`, PAI'D clients) —
  the money path was just audited and hardened; web work reads its public endpoints only.
- Rewording marketing/compliance claims — the honesty tests own those; if a claim blocks
  you, stop and flag rather than editing the claim.

## When done

All 17 pages of the spec exist and pass their acceptance criteria; Gate-3 and Gate-4 checks
from BUILD-PLAN.md §5 pass; CI green; `docs/web-plan/BUILD-PLAN.md` status table updated the
same way the landed rows above are marked. Leave a summary of deviations per WO in the final
commit body.
