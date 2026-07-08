# Iliad Web App — Build Plan to the 17-Page Spec

## Status (as of 2026-07-07)

**Foundation (Wave 0): all 5 landed.** WO-F1 `6d1fd88` · WO-F2 `c5fd02c` · WO-F3 `b1696cc` · WO-F4 `f22d4a7` · WO-F5 `9f6e959`.

**Pages: 8 of 17 landed (WO-P1–P8).** WO-P1 `5cf826c` · WO-P2 `2d1a327` · WO-P3 `b6969ba` · WO-P4 `f6b1cf1` · WO-P5 `1236b11` · WO-P6 `a187f41` · WO-P7 `5f7249b` · WO-P8 `2a60c10`. **Not started: WO-P9–P17** (commerce hub, usage/billing, projects list, settings, docs hub, 404 sweep, playground/changelog/status bonus pages) — plan below is unchanged for these, still accurate as written.

**API: WO-A1, A2, A3 landed** (`GET /v1/projects`, `GET /v1/projects/:id/snapshots`, `GET /v1/account/usage/timeseries` all live in `server.ts`). **Not started: WO-A4** (changelog endpoint, blocks WO-P16), **WO-A5** (`PATCH`/`DELETE /v1/account`, blocks WO-P12's account-deletion acceptance criterion — only `GET /v1/account` exists today). **WO-A6 correctly still deferred** per its own spec. **WO-A7 correctly still optional/backlog.**

**Known test-suite caveat, unrelated to this plan's work:** `apps/api/src/production-startup.test.ts` and `apps/api/src/rate-limiter.test.ts` fail intermittently under heavy machine load (both spin up real HTTP servers on ephemeral ports with a hard 5000ms per-test timeout; the file's own code comment notes it was already rewritten once to fix this exact class of flakiness — work order A11). Confirmed via isolated re-run that failures are load-sensitive timeouts, not logic errors, and neither file has been touched by any WO-P/WO-F/WO-A work. If you hit red here, re-run alone before assuming a regression.

**Actual execution order diverged from Section 5's Wave 1/2/3/4 grouping below** — work ran WO-P1→P8 roughly in numeric order rather than the doc's original cross-page grouping (e.g. P2 and P8 shipped before P11). Section 5 is kept as-is below since it's still a reasonable guide for what's left (P9 onward), not a record of what happened.

---

**Scope discipline:** No new npm dependencies (routing = hand-rolled hash routing, graphs = hand-rolled SVG). No class components (except existing `ErrorCatcher`). Cookie-session auth only (`establishSession`/`markAuthed`, never raw keys in storage). PAI'D is the only checkout path (`POST /portal/api/subscribe`), never `POST /v1/checkout`. TypeScript strict. All paths relative to `apps/web/src/` unless noted; API work in `apps/api/src/`.

---

## 1. Information Architecture

### 1.1 Navigation model decision

Keep hash-based routing — **no router dependency** (CLAUDE.md "no new deps"). But the current string-union + 7-touch-site pattern (`App.tsx:57-240`) does not scale to ~9 new pages and cannot express parameterized routes (`#projects/:id`). **Flagged decision: hand-roll a route table** (WO-F2) — a single `routes.ts` array that is the sole source of truth for hash pattern, params, label, sidebar section, auth flag, and component. This is a refactor of existing navigation, not a new architecture, so it does not violate "don't change the architecture pattern."

### 1.2 URL scheme (hash routes; pathname aliases kept for marketing SEO)

```
/                        → #home            Landing/Hero (evolved UploadPage marketing half)
#analyze                 → Analyze Repo (form half of UploadPage)
#playground              → Live demo, no login (BONUS 1)
#dashboard               → Account dashboard overview (NEW meaning)
#projects                → Projects/History list
#projects/:id            → Project detail (repurposed DashboardPage) — tabs:
                            overview | files | deps | artifacts | versions | programs | search
#projects/:id/artifacts  → Artifact Explorer (deep-linkable tab)
#projects/:id/versions   → Version history + diff viewer (deep-linkable tab)
#run/:program?           → Program Runner
#mcp                     → MCP Configuration (merge InstallPage + ToolsIndexPage + live manifest)
#commerce                → Agentic Purchasing/Commerce hub
#usage                   → Usage & Billing (split out of AccountPage)
#settings                → Settings (account, keys, webhooks, seats, GitHub tokens)
#plans, #paid-checkout   → (existing, unchanged)
#docs (+#docs/api, #docs/mcp) → Documentation Hub + OpenAPI explorer + MCP spec
#examples, #programs, #for-agents, #help, #qa, #terms → existing, kept
#changelog               → Changelog (BONUS 2)
#status                  → Status page (BONUS 3)
<anything else>          → 404 page (stop silently falling back to upload, App.tsx:236)
```

Pathname aliases (`/pricing`, `/mcp`, `/docs`, `/status`, `/changelog`, `/playground`) stay in the alias table for marketing/SEO URLs.

### 1.3 Sidebar tree (existing IDE-cockpit shell, regrouped)

- **WORKSPACE:** Analyze · Dashboard · Projects · Program Runner
- **LIBRARY:** Programs · MCP · Commerce Tools · Examples · Docs
- **ACCOUNT:** Usage & Billing · Settings · Plans
- **HELP:** Help · Q&A · Status · Changelog

CommandPalette (Ctrl+K) gets all new pages + "Open project…" fuzzy list once `GET /v1/projects` exists. Logged-out users see WORKSPACE collapsed to Analyze + Playground.

### 1.4 State model change (prerequisite, in WO-F3)

Replace the single `axis_last_result` localStorage blob with: server as source of truth (`GET /v1/projects` → `GET /v1/projects/:id/context`/`generated-files`), localStorage keeps only `axis_last_project_id` + an anon-results cache (anonymous snapshots have no account and must stay client-side).

---

## 2. Foundation Work-Orders (Wave 0)

### WO-F1 — Design-token dogfood bridge — **S**  
**Status: DONE** (6d1fd88)
- **Files:** new `apps/web/src/theme.css` (copy of `.ai/theme.css` with two corrections: fonts → Inter/JetBrains Mono, light accent → `#0a5a6b` per `index.css:21-23`); `main.tsx` (import before index.css); `index.css` (replace `:root` var definitions with an alias block per Audit 3's mapping table: `--bg→--surface-page`, `--text→--color-neutral-900`, `--green→--color-success`, etc. — zero JSX churn); add the bug-fix aliases `--success`, `--danger`, `--orange`, `--surface`, `--warning`, `--warning-bg`, `--bg-elev`.
- Also fix hardcoded hex: `SearchTab.tsx:97-104,284` (theme-aware symbol palette via vars), `ExamplesPage.tsx:430,532,591,666` + `InstallPage.tsx:20` (`#fff` → `var(--accent-ink)`).
- Adopt theme.css's OS-preference dark mode; `App.tsx:177-182` toggle becomes explicit override.
- **Acceptance:** the 6 undefined-var bugs render correctly in both themes; OS dark preference respected on first visit; no visual regression on existing pages; the app imports the generated design-system contract (dogfood loop closed on the consume side).

### WO-F2 — Route table + 404 — **M**  
**Status: DONE** (c5fd02c)
- **Files:** new `routes.ts` (route defs: `pattern`, `page` id, `label`, `section`, `authOnly`, `params` parser), new `useHashRoute.ts` hook (hashchange listener, pattern match incl. `:id` segments, back/forward safe); rewrite `App.tsx` nav plumbing (`pageFromHash`, `SECTION_OF`, `LABEL_OF`, sidebar tree, mobile drawer, palette actions all derive from the table); new `pages/NotFoundPage.tsx` (on-brand: search box, links to Docs/Analyze/Help, reports the bad hash).
- Preserve: `AUTH_ONLY_PAGES` gating semantics, OAuth-callback guard (`App.tsx:86-88`), Ctrl+1–9 shortcuts, `pages.test.tsx` must pass (update as needed).
- **Acceptance:** adding a page = one entry in `routes.ts`; `#projects/abc123` parses params; unknown hash renders 404 (not upload); deep links + browser back/forward work; all existing pages still reachable at old URLs.

### WO-F3 — API client expansion + multi-project state — **M**  
**Status: DONE** (b1696cc)
- **Files:** `api.ts` — add typed clients: `listProjects()`, `listProjectSnapshots(id)`, `getSnapshotVersions/getVersion/getDiff` (handle 402 `persistence_credits_required`), `getUsageTimeseries()`, `getChangelog()`, `patchAccount()`, `deleteAccount()`, `getMcpManifest()` (`/v1/mcp/server.json`), `searchMcpTools(q)`, `getOpenApiSpec()` (`/openapi.json`), `getStats()`, health probes. `App.tsx` — replace single-result state with `currentProjectId` + anon-result cache. Update `api.test.ts`.
- **Depends:** WO-A1, WO-A2, WO-A3, WO-A4, WO-A5 (stub against mini-specs; ship behind the API merges).
- **Acceptance:** all new endpoints callable with typed results and structured `ApiError`s; existing anon analyze flow unaffected.

### WO-F4 — Shared primitives + footer + error/empty patterns — **M**  
**Status: DONE** (f22d4a7)
- **Files:** new `components/primitives/`: `StatTile`, `SectionHeader`, `CodeBlock` (copy button, mono, wraps existing hand-rolled trio in InstallPage/ExamplesPage/DocsPage), `TableWrap`, `Callout`, `Pill`, `Skeleton` (use theme.css `shimmer`), `EmptyState` (icon + message + CTA prop, replaces per-page hand-rolls), `Sparkline` + `BarChart` (hand-rolled SVG, no dep — consult dataviz conventions), `PageFooter` (legal/Terms · Status · v`version.ts` · Support/Help · Docs — rendered by the shell on every page above the StatusBar). Add ~12 utility classes to `index.css` (`.text-muted`, `.text-sm`, `.mb-*` on `--space-*`, `.stack`, `.gap-*`).
- Error-handling hardening: `api.ts:409` — never surface raw server body >0 chars to UI; map to human copy + "details" disclosure.
- **Acceptance:** primitives Storybook-style demo section on a hidden `#__kitchen-sink` route (dev aid); footer visible on every page in desktop + mobile; raw server error text no longer reaches users.

### WO-F5 — Single source for counts/URLs — **S**  
**Status: DONE** (9f6e959)
- **Files:** new `apps/web/src/config.ts` exporting `API_BASE`, `PROGRAM_COUNT`, `ARTIFACT_COUNT`, `TOOL_COUNT` (ideally generated from `apps/api/src/counts.ts` at build or fetched from `GET /`); replace the duplicated `141/20/35` literals and the divergent bases in `ForAgentsPage.tsx:2`, `InstallPage.tsx:4` (both must use `api.ts:4` base).
- **Acceptance:** grep for `axis-api-6c7z.onrender.com` in `apps/web/src` returns 0 hits; counts sourced from one module; extend the count-honesty test to cover web.

---

## 3. Page / Feature Work-Orders

### WO-P1 — Landing/Hero + Live Demo — **M**  
**Status: DONE** (5cf826c)
- **Extends:** `pages/UploadPage.tsx` (split: marketing half → `pages/HomePage.tsx`; form half → `pages/AnalyzePage.tsx`).
- **API:** `GET /` (live counts), `GET /v1/stats` (social proof: calls today, top tools), anon `POST /v1/analyze`.
- **Content:** "Analyze any repo in seconds" headline; free-tier CTA → `#analyze`; live demo = embedded playground teaser (see WO-P15) showing a real anon analysis of a sample repo; program badges + example output kept.
- **Login-gate change:** anonymous analyses **complete and display free-program results** (backend already allows this); the SignUpModal (`App.tsx:263-269` `pendingResultRef` intercept) moves to point-of-value: "Sign up to save this project / unlock 17 paid programs." This is the single biggest funnel change — confirm with owner before shipping.
- **Acceptance:** logged-out visitor lands, reads the value prop, runs a real free analysis, and sees real results without an account; stats are live, not hardcoded.

### WO-P2 — Auth & API-key polish — **S**  
**Status: DONE** (2d1a327)
- **Extends:** `components/SignUpModal.tsx`, `components/AuthButtons.tsx`, key management stays (moves to Settings in WO-P12).
- **API:** existing OAuth + `/v1/auth/exchange` + `/v1/account/keys*`. **No email/password build** (backend has none — see Honesty H1).
- **Work:** contextual signup copy per trigger (save project / paid program / quota); post-OAuth redirect returns to the page that triggered login, not always `#account`.
- **Acceptance:** signup from any gate returns the user to what they were doing; key create/reveal-once/revoke unchanged and passing tests.

### WO-P3 — Dashboard Overview (account-level) — **M**  
**Status: DONE** (b6969ba)
- **New:** `pages/AccountDashboardPage.tsx` at `#dashboard`. (Existing `DashboardPage.tsx` is renamed/repurposed as project detail — WO-P5.)
- **API:** `GET /v1/projects` (**WO-A1**), `GET /v1/account/usage`, `GET /v1/account/quota`, `GET /v1/account/upgrade-prompt`, `GET /v1/account/usage/timeseries` (**WO-A3**, for the sparkline).
- **Content:** recent-projects cards (name, repo URL, last-analyzed, status, compliance grade; click → `#projects/:id`), usage StatTiles + quota bar + 14-day sparkline, quick actions (Analyze new repo · Run a program · Open MCP config · Invite teammate), `NextStepsCard` onboarding retained for zero-project state.
- **Acceptance:** a logged-in user with 3 projects sees all 3, one click opens any of them, usage numbers match `#usage` page; empty state onboards to first analysis.

### WO-P4 — Analyze Repo (advanced options) — **M**  
**Status: DONE** (f6b1cf1)
- **Extends:** `pages/AnalyzePage.tsx` (from WO-P1 split), `upload-utils.ts`.
- **API:** existing `POST /v1/analyze` / `POST /v1/github/analyze` (accepts `token`), `GET /v1/programs` (drive the selector from API instead of the hardcoded 45-output list at `UploadPage.tsx:22-87`), `GET /v1/account/github-token` (offer stored tokens for private repos).
- **Work:** explicit branch field (backend already parses `/tree/branch` URLs — surface it); private-repo path: pick a stored GitHub token or paste one (send as `token`, never persist client-side); budget controls surfaced as "lite mode" toggle (`X-Agent-Mode: lite` header, honest pricing copy); keep tier pre-check + gzip + UpsellModal flows intact.
- **Not built:** depth/exclude server controls (no API — Honesty H7); ZIP multipart (client-side unzip stays — Honesty H6).
- **Acceptance:** user analyzes a private repo on a non-default branch using a stored token; program selector reflects live `GET /v1/programs`; lite mode demonstrably changes the 402 pricing payload.

### WO-P5 — Project/Snapshot Detail + Version History + Diff Viewer — **L**  
**Status: DONE** (1236b11)
- **Extends:** `pages/DashboardPage.tsx` → `pages/ProjectPage.tsx` (route `#projects/:id`); keeps Overview/Structure/Dependencies/Programs/Search tabs and Alt+1–6 shortcuts; **new tabs:** Versions, Artifacts (WO-P6).
- **New:** `components/VersionsTab.tsx`, `components/DiffViewer.tsx` (hand-rolled side-by-side/unified diff render — no dep; the API returns the computed diff).
- **API:** `GET /v1/projects/:id/context`, `GET /v1/snapshots/:id`, `GET /v1/projects/:id/snapshots` (**WO-A2**), `GET /v1/snapshots/:id/versions`, `.../versions/:n`, `GET /v1/snapshots/:id/diff?old=&new=` — **must handle 402 `persistence_credits_required`** with a credit-purchase CTA into the existing credits flow, `GET/POST /v1/projects/:id/memory`, `DELETE /v1/snapshots/:id` and `DELETE /v1/projects/:id` (with confirm).
- **Acceptance:** user opens any historical project by URL, browses snapshot list, selects two versions, views a rendered diff (or a clear "1 credit required" prompt on paid tier), reads/writes project memory, deletes a snapshot.

### WO-P6 — Artifact Explorer — **L**  
**Status: DONE** (a187f41)
- **Extends:** `components/GeneratedTab.tsx` → `components/ArtifactExplorer.tsx` (tab of ProjectPage + deep link `#projects/:id/artifacts`).
- **API:** existing only — `GET /v1/projects/:id/generated-files` (content is inline → all search/filter is client-side), `GET .../generated-files/:path` (raw download), `GET /v1/projects/:id/export?program=` (ZIPs).
- **Work:** search box (name + content substring), program + file-type filters, tree/grid toggle, preview pane with lightweight hand-rolled highlighting (markdown rendered via a small internal md-to-HTML util or `<pre>` with heading styling — no dep; flag if a highlighter dep is wanted), per-file download button, per-program ZIP + full ZIP kept, copy-path/copy-content.
- **Acceptance:** in a 141-artifact project, user types "docker", sees matching files across programs in <1s, previews one, downloads it alone, then downloads the deploy-program ZIP.

### WO-P7 — Program Runner — **M**  
**Status: DONE** (5f7249b)
- **Extends:** `components/ProgramLauncher.tsx` + new `pages/RunnerPage.tsx` (`#run/:program?`; launcher stays embedded in ProjectPage too).
- **API:** existing 20 program endpoints via `makeProgramHandler` shape; `GET /v1/programs` for the catalog; search endpoints (`/v1/search/index|query`) for the search program.
- **Work:** program picker → target project picker (from `GET /v1/projects`) → options panel (the only real parameters today: lite/budget headers, program-specific body fields where handlers accept them — derive from OpenAPI spec, don't invent) → run → **honest progress** (staged status: "request sent → server processing (sync, may take up to Ns) → done"), results panel listing produced files with jump-links into the Artifact Explorer; 402 MPP payload rendered as the negotiation/upgrade card (existing UpsellModal pattern).
- **No fake streaming** — live token-by-token output is blocked on WO-A6 (Honesty H2); the UI is designed with a slot for it.
- **Acceptance:** user runs "theme" against project X from the Runner page, watches honest status, and lands on the new artifacts; a free user hitting a paid program sees the 402 payload rendered with price + lite-mode option, not an error dump.

### WO-P8 — MCP Configuration — **M**  
**Status: DONE** (2a60c10)
- **Extends:** merge `pages/InstallPage.tsx` + `pages/ToolsIndexPage.tsx` → `pages/McpPage.tsx` (`#mcp`); `ForAgentsPage` stays as the agent-facing marketing page.
- **API:** all existing + now **fetched live instead of hardcoded**: `GET /v1/mcp/server.json` (manifest viewer), `GET /v1/mcp/tools?q=&program=` (searchable tool registry — kills the hardcoded 35-tool list drift), `GET /v1/install/:platform` (config snippets), `POST /probe-intent` (interactive "describe your need → tool suggestion" capability explorer).
- **Work:** manifest panel, searchable/filterable tool registry with per-tool detail (args schema, auth, price), platform tabs (Claude Desktop/Code, Cursor, VS Code) with copy buttons fed by the install endpoint, integration guide, live probe-intent demo box (public, no auth).
- **Acceptance:** tool count and tool list on the page come from the API (change a tool server-side → page reflects it); user copies a working Claude Code config with their key placeholder; probe-intent box returns a real routing suggestion.

### WO-P9 — Agentic Purchasing / Commerce Hub — **M**
- **New:** `pages/CommercePage.tsx` (`#commerce`).
- **API:** existing only — `POST /v1/agentic-purchasing/generate` (paid run), `POST /v1/prepare-for-agentic-purchasing` (readiness score), `POST /probe-intent`, then **render the generated artifacts** (playbook, negotiation-rules, checkout-flow, product-schema) via generated-files endpoints.
- **Work:** explainer + readiness-check form (repo → score card), "generate kit" CTA (paid, 402-aware), and an artifact-driven viewer: playbook rendered as structured doc, negotiation rules as a table, **checkout preview = visualization of the generated `checkout-flow` artifact** (steps diagram), Visa compliance kit summary from CLAUDE.md claims *only where backed by artifact content*.
- **Honesty:** no functional checkout is simulated; the preview is explicitly labeled "generated flow for YOUR repo" (Honesty H3). Un-stub or remove the `coming_soon` cards from ToolsIndexPage — dead disabled cards violate the no-dead-UI rule.
- **Acceptance:** paid user generates the purchasing kit for a project and reads the playbook + negotiation rules + flow diagram in-app without downloading a ZIP; free user sees readiness score + honest upgrade path.

### WO-P10 — Usage & Billing — **M**
- **Extends:** split `pages/AccountPage.tsx`: billing/usage half → `pages/UsagePage.tsx` (`#usage`); profile/keys/seats half → Settings (WO-P12). Keep `PlansPage`, `PaidCheckoutPage` as-is.
- **API:** existing usage/quota/credits/subscription/billing-history/proration endpoints + **`GET /v1/account/usage/timeseries` (WO-A3)** for graphs.
- **Work:** usage graphs (hand-rolled SVG BarChart/Sparkline from WO-F4): runs per day (30d), per-program breakdown, credit balance over time from the ledger; tier card with proration preview on change; credits ledger + PAI'D top-up packs retained; billing history table. Evaluate un-gating `MyAnalyticsPage` heuristics into this page (Honesty H8).
- **Acceptance:** user sees a real 30-day usage chart, buys a credit pack via PAI'D checkout redirect, previews proration before a tier change; zero Stripe-direct calls.

### WO-P11 — Projects / History — **M**
- **New:** `pages/ProjectsPage.tsx` (`#projects`).
- **API:** `GET /v1/projects` (**WO-A1**), `DELETE /v1/projects/:id`, `GET /v1/projects/:id/export`.
- **Work:** table/card list — repo name+URL, last analyzed, snapshot count, status, compliance grade; quick actions per row: Open · Re-analyze (pre-fills Analyze form with the repo URL) · Export ZIP · Delete (confirm); search/sort; empty state → Analyze CTA. Sidebar "Dashboard" item no longer hidden behind result-existence (`App.tsx:434`).
- **Acceptance:** user with N projects lists them all, re-runs one in two clicks, deletes one, and the list + dashboard stay consistent.

### WO-P12 — Settings — **M**
- **New:** `pages/SettingsPage.tsx` (`#settings`), sections composed from AccountPage extractions + new panels.
- **API:** existing — keys CRUD, webhooks CRUD + deliveries (`/v1/account/webhooks*`), seats (`/v1/account/seats*`, paid/suite-gated — backend EXISTS, keep it), GitHub tokens (`/v1/account/github-token*`), program entitlement toggles (`/v1/account/programs`), logout. **New:** `PATCH /v1/account` + `DELETE /v1/account` (**WO-A5**) for profile edit + account deletion.
- **Work:** sectioned page (Profile · API Keys · GitHub Tokens · Webhooks (+delivery log viewer) · Team Seats · Programs · Danger Zone). Tier-gate seats honestly ("Team seats available on Paid/Suite") rather than hiding.
- **Acceptance:** user renames account, adds a webhook and inspects a delivery, stores a GitHub token (prefix-only listing), invites a seat (paid), deletes account with typed confirmation.

### WO-P13 — Documentation Hub — **L**
- **Extends:** `pages/DocsPage.tsx`.
- **API:** `GET /openapi.json` (**live OpenAPI explorer** — hand-rolled renderer: tag-grouped endpoint list, expandable params/schemas, copy-curl; no swagger-ui dep), `GET /v1/docs.md`, `GET /llms.txt`, `GET /mcp/docs`, `GET /v1/mcp/tools`.
- **Work:** replace the static ApiSection (`DocsPage.tsx:636`) with the OpenAPI-driven explorer; new "MCP Protocol" tab (server manifest, transport, auth, tool schemas from the live registry); "Example Artifacts" tab links to ExamplesPage + real artifacts from a public demo project if WO-A7 lands (else static, labeled as samples); keep Programs/Outputs/CLI tabs but source counts from WO-F5 config.
- **Acceptance:** every documented endpoint on the page exists in the live spec (drift impossible by construction); user copies a working curl for any endpoint; MCP spec page shows the live 35-tool registry.

### WO-P14 — 404 + error-state sweep — **S**
- **Extends:** WO-F2's NotFoundPage + app-wide pass.
- **Work:** audit every fetch site for the four patterns (Skeleton while loading, EmptyState when zero, Callout-error with retry, UpsellModal on 402/429); fix a11y click-only divs (`DashboardPage.tsx:150-165`, `GeneratedTab.tsx:69-87`, `CommandPalette.tsx:156-168`, `QAPage.tsx:346-349` → `role`/`tabIndex`/keyboard handlers); PaidCheckout error mapping retained.
- **Acceptance:** keyboard-only user can operate tabs, file lists, palette, FAQ; no page ever renders a raw error string or a blank region.

### WO-P15 — Live Demo / Playground (BONUS) — **M**
- **New:** `pages/PlaygroundPage.tsx` (`#playground`, public).
- **API:** anon `POST /v1/analyze` (free programs), `GET /v1/account/quota` (anon rate-limit display), `POST /probe-intent`.
- **Work:** zero-login flow: paste a public repo URL (or pick from 3 curated sample repos) → free-program analysis → inline results with artifact previews → "Sign up to save + unlock 17 more programs" CTA; visible anon rate-limit meter; results cached in the anon localStorage slot.
- **Acceptance:** a visitor with no account gets real artifacts for a real repo in one interaction; conversion CTA appears after value delivery.

### WO-P16 — Changelog (BONUS) — **S**
- **New:** `pages/ChangelogPage.tsx` (`#changelog`).
- **API:** `GET /v1/changelog` (**WO-A4**).
- **Acceptance:** page renders the repo CHANGELOG.md grouped by version, current version badge links here from StatusBar/footer.

### WO-P17 — Status page (BONUS) — **S**
- **New:** `pages/StatusPage.tsx` (`#status`); StatusBar dot links here.
- **API:** existing `GET /v1/health`, `/v1/health/live`, `/v1/health/ready`, `/v1/metrics`, `/v1/stats`, `/performance`.
- **Work:** current-status panels (API up/down, latency from a timed health probe, version, calls today) + session-local uptime ticker. **No incident history / uptime percentage** — no backend storage for it (Honesty H4).
- **Acceptance:** user sees live green/red per subsystem and current latency; nothing on the page claims history that isn't stored.

---

## 4. API Work-Orders (apps/api — each is its own PR with tests)

### WO-A1 — `GET /v1/projects` — **S** (CRITICAL PATH)  
**Status: DONE** (handleListProjects, live)
- Auth: Key. Returns `{projects: [{project_id, name, github_url, created_at, latest_snapshot: {snapshot_id, status, created_at, file_count, compliance_grade}, snapshot_count}], total}`. Backing query `listProjectsByAccount` already exists in `@axis/snapshots` (wired only to fleet today). Pagination `?limit=&offset=`, newest first. Blocks WO-P3, WO-P7, WO-P11.

### WO-A2 — `GET /v1/projects/:id/snapshots` — **S**  
**Status: DONE** (handleListProjectSnapshots, live)
- Auth: owner. Returns snapshot list (id, status, created_at, file_count, compliance_grade), newest first. Unblocks cross-snapshot version history in WO-P5 (current reads hardcode "latest").

### WO-A3 — `GET /v1/account/usage/timeseries?bucket=day&since_days=30` — **S**  
**Status: DONE** (handleGetUsageTimeseries, live)
- Auth: Key, self-scoped. Returns `{buckets: [{date, runs, by_program: {...}, credits_spent}]}`. Alternative (owner's call): drop the `isAdminCaller` 403 on `GET /v1/account/analytics/summary` — it already scopes to caller's own account_id. Blocks usage graphs (WO-P3, WO-P10).

### WO-A4 — `GET /v1/changelog` — **S**
- Public. Serves repo-root `CHANGELOG.md` as `text/markdown` (read at boot or per-request with cache header). Blocks WO-P16.

### WO-A5 — `PATCH /v1/account` + `DELETE /v1/account` — **M**
- Auth: Key. PATCH: `{name?, email?}` with validation; email change should require re-verification only if/when email verification exists (it doesn't — accept with audit-log entry for now, note in response). DELETE: cascades keys/webhooks/tokens/seats; projects/snapshots per retention policy (spec the policy in the PR — recommend hard-delete with 0-day grace for v1, documented). Blocks Settings completeness (WO-P12).

### WO-A6 — Async program runs / SSE progress — **L** (DEFERRED — do not block Wave 2 on this)
- Spec: `POST /v1/runs {program, snapshot_id, options}` → `202 {run_id}`; `GET /v1/runs/:id` polling and/or `GET /v1/runs/:id/events` SSE (`stage`, `file_written`, `done|error`). Requires job store + moving the 17 synchronous `makeProgramHandler` bodies behind a queue — significant server refactor. Runner (WO-P7) ships honest sync UX first and adopts this when it lands.

### WO-A7 — Optional/backlog — **S each**
- `GET /v1/snapshots/:id/generated-files` (artifacts for non-latest snapshots — makes Artifact Explorer version-aware); public demo-project examples endpoint (feeds WO-P13/P15 with real artifacts); multipart/ZIP intake (kills client-side unzip). None block the spec's 17 pages.

---

## 5. Build Order (waves; integration/verification at each boundary)

**Wave 0 — Foundation (parallel: web + API)**
Web: WO-F1 → WO-F2 → WO-F3 → WO-F4, WO-F5. API: WO-A1, WO-A2, WO-A3, WO-A4, WO-A5 (independent, parallelizable).
*Gate 0:* all existing tests green (`pages.test.tsx`, `api.test.ts`, count-honesty); visual smoke of every existing page in light+dark+mobile; new endpoints have tests + OpenAPI entries; 404 live.

**Wave 1 — Core loop (analyze → project → artifacts)**
WO-P1 (landing+demo funnel), WO-P4 (analyze advanced), WO-P11 (projects list), WO-P3 (dashboard overview), WO-P5 (project detail+versions+diff), WO-P6 (artifact explorer). Order within wave: P11/P3 first (prove WO-A1), then P5/P6, then P1/P4.
*Gate 1:* end-to-end journey verified manually: signup → analyze private repo → open project → diff two versions (incl. 402 credit path) → search artifacts → download ZIP. Anon journey: land → playground-style demo → convert.

**Wave 2 — Operate & pay**
WO-P7 (runner), WO-P10 (usage+billing graphs), WO-P12 (settings), WO-P2 (auth polish).
*Gate 2:* paid-program 402 MPP payload, PAI'D checkout redirect, credit top-up, webhook delivery log, seat invite — all exercised against staging; no `POST /v1/checkout` call sites exist.

**Wave 3 — Ecosystem & docs**
WO-P8 (MCP), WO-P9 (commerce hub), WO-P13 (docs+OpenAPI), WO-P15 (playground page proper), WO-P16 (changelog), WO-P17 (status).
*Gate 3:* drift check — tool counts/lists/endpoints on MCP+Docs pages are API-fed (change server, see page change); commerce hub renders only artifact-backed content.

**Wave 4 — Polish & hardening**
WO-P14 (error/a11y sweep), inline-style migration phases 2-3 from Audit 3(e) (utility-class sweep of DocsPage/HelpPage/ExamplesPage/TermsPage as separate reviewable PRs), inline-style CI ratchet test, mobile pass on all new pages, performance pass (lazy-load heavy pages via dynamic import), CommandPalette completeness.
*Gate 4 (ship):* keyboard-only walkthrough of all 17 pages; Lighthouse a11y ≥ 95 on the 5 core pages; WO-A6 go/no-go decision for streaming runner v2.

**Dependency spine:** WO-F2 blocks every new page. WO-A1 blocks P3/P7/P11. WO-A2 blocks P5 versions tab. WO-A3 blocks graphs in P3/P10. WO-F1/F4 block nothing hard but should land first so new pages are written token-clean from day one.

---

## 6. Honesty Notes (build nothing fake)

- **H1 — Email/password login: DO NOT BUILD.** Backend has OAuth + key exchange only — no password store, verification, or reset. A password form would be dead UI. If the owner wants classic login, that's a new API workstream (out of scope here).
- **H2 — "Live output" in the Program Runner:** all 20 programs are synchronous in-request. Runner v1 must show honest staged status, not simulated streaming. Real streaming = WO-A6 (deferred, L).
- **H3 — Commerce "checkout preview":** there is no executable checkout to preview. Render the *generated* checkout-flow artifact and label it as the customer's generated flow. Also: PAI'D-only for Iliad's own payments; never resurrect `POST /v1/checkout` (legacy Stripe-direct, per payment-architecture memory).
- **H4 — Status page history:** no incident/uptime storage exists. Ship current-status only; no fabricated 99.9% badges or historical graphs.
- **H5 — Team seats: REAL, keep it.** Contrary to the "check audit 2" suspicion, the backend has full seat CRUD (`/v1/account/seats*`, accept/revoke), tier-gated. Existing AccountPage UI moves to Settings intact.
- **H6 — ZIP/multipart upload:** backend accepts JSON `files[]` only. Keep client-side unzip (works today); server intake is optional backlog (WO-A7).
- **H7 — Analyze "advanced options" ceiling:** branch + private-token + lite-mode are backend-real. Depth/exclude-pattern server controls are NOT — client-side exclusions (`upload-utils.ts`) are the honest boundary; don't render server-side knobs that don't exist.
- **H8 — Usage graphs are blocked on WO-A3.** `/v1/account/analytics/summary` 403s for non-admins today. If WO-A3 is rejected, the Usage page ships tables only — do not chart fake buckets. Decision needed: un-gate summary vs. new timeseries endpoint.
- **H9 — Funnel change in WO-P1** (anon results shown before signup) reverses the current `pendingResultRef` gate — a deliberate conversion-strategy call, not a bug fix. Needs explicit owner sign-off; the plan assumes yes because the spec demands a no-login live demo.
- **H10 — Generator-side token fixes are out of web scope** but should be filed: `brand-board.md` invents an indigo palette contradicting the real cyan tokens, and `theme.css` ships wrong fonts/accent — fix `generators-brand.ts`/theme generator to read real tokens (closes the dogfood loop in the other direction).
- **H11 — Docs counts:** every count shown (programs/artifacts/tools/endpoints) must route through WO-F5 config or live API per the verify-docs-vs-runtime memory; extend count-honesty tests to the web bundle.

**Effort roll-up:** Foundation 1×S+3×M+1×S · Pages 4×S+9×M+3×L · API 4×S+1×M+1×L(deferred). Critical path: WO-F2 → WO-A1 → WO-P11/P3 → WO-P5/P6.