# Axis' Iliad — v1.0 Launch Gap List

**Cut line strategy**: every item below is tagged with one of four tiers. `MUST` items block v1; `SHOULD` items prevent embarrassment; `COULD` items improve the launch but aren't blocking; `DEFER` items are explicitly out-of-scope for v1.

Effort estimates: **S** = under 4h, **M** = 1–3 days, **L** = 1–2 weeks, **XL** = month+.

Each item names the file or surface it touches so it's actionable, not aspirational.

---

## A. Catalog honesty (MUST — credibility blocker)

The current MCP `tools/list` returns 27 tools. Of those, 6 are real, 4 are third-party proxies, 12 are planned-capability envelopes, and 5 are discovery/list utilities. Shipping that to public registries reads as "AXIS exposes 27 tools" — but a developer evaluating us will call one of the 12 envelopes within 5 minutes and conclude the platform isn't ready.

- [ ] **MUST · S** — Hide the 12 `PLANNED_CAPABILITIES` entries from public `tools/list` by default. Keep them visible to authenticated calls with `?include_planned=true` for internal discovery. `apps/api/src/mcp-server.ts` + `mcp-server.test.ts`.
- [ ] **MUST · S** — Add a `provider` field on every `MCP_TOOLS` entry whose backend is third-party. Tools Index page (`apps/web/src/pages/ToolsIndexPage.tsx`) renders "Powered by Firecrawl / OpenAI / Resend" chips so users see what's actually running. The 4 affected tools: `iliad_web_research`, `iliad_web_research_crawl`, `iliad_embeddings`, `iliad_transactional_email`.
- [ ] **MUST · S** — `capability-map.yaml` marketing copy distinguishes `live_proxy` from `owned` everywhere it surfaces (currently `summary` field is honest, but the program count quotes lump them together).
- [ ] **SHOULD · S** — Tools Index `coming_soon` entries (6 listed) need either real GUI pages or removal from the catalog. Pick the 3 highest-value ones for v1 (analyze, purchasing preview, list-programs already live; that leaves search-tools, improve-agent, purchasing-full, closer to address). `apps/web/src/pages/tools/`.

---

## B. Backend — what stays, what gets owned, what gets cut (MUST)

- [ ] **MUST · S** — Decide and announce: are the 4 proxy `iliad_*` tools `live_proxy` (current honest label) or do we delay v1 until they're owned? **Recommendation**: keep them as `live_proxy` with the `provider` chip from item A.
- [ ] **MUST · S** — Add pricing tiers in `@axis/mpp/src/index.ts` `PRICING_TIERS` for the 6 real `iliad_*` tools. Currently zero pricing entries for `iliad_object_storage`, `iliad_vector_database`, `iliad_embeddings`, `iliad_transactional_email`, `iliad_web_research`, `iliad_web_research_crawl`. Without these the 402 negotiation falls through to the default tier ($0.50/run) which doesn't match the per-operation cost shape.
- [ ] **MUST · S** — Wire owned tools into MPP 402 flow so anonymous agents can pay per call. `apps/api/src/handlers.ts` + `chargeWithDiscounts()`.
- [ ] **SHOULD · M** — Convert `iliad_web_research` from Firecrawl proxy to in-process Playwright. ~250 LoC handler + tests; one new dep (`playwright`). Replaces the wrapper with owned orchestration. Capability-map status `live_proxy` → `owned`.
- [ ] **SHOULD · M** — Convert `iliad_transactional_email` from Resend proxy to direct SMTP submission via `nodemailer`. ~200 LoC; one new dep. Operator supplies SMTP credentials; no SaaS middleman. Capability-map status `live_proxy` → `owned`.
- [ ] **COULD · L** — Convert `iliad_embeddings` to in-process inference via ONNX runtime. Requires resolution of the model-file-ownership story (we'd ship a downloaded BAAI/MiniLM as an "AXIS asset" — be honest that we didn't train it).
- [ ] **DEFER · v1.1+** — Owned implementations for: `iliad_llm_inference`, `iliad_image_generation`, `iliad_text_to_speech`, `iliad_speech_to_text`, `iliad_web_search`, `iliad_code_sandbox`, `iliad_document_parsing`, `iliad_analytics`. Each is its own project. The capability-map keeps them as discovery-only entries.
- [ ] **MUST · S** — Either ship the 12 planned-capability stubs as `?include_planned=true` only (per item A) or delete them from `MCP_TOOLS` entirely for v1. Recommendation: delete from public surface; the capability-map.yaml artifact keeps the roadmap visible without polluting `tools/list`.
- [ ] **MUST · S** — Update `MCP_TOOL_COUNT` in `counts.ts` to reflect the trimmed public catalog (probably 15: 5 owned-or-real-proxy + 5 discovery + 5 commerce). counts-consistency test catches drift.

---

## C. Frontend — final polish (MUST/SHOULD)

The 16 pages are functionally complete. Real work needed:

- [ ] **MUST · S** — Single-pager v1 launch landing page (could be a new `LandingPage.tsx` rendered for unauthenticated visitors, or replace `UploadPage` as the default route). Honest about the 6 real iliad_* tools, the 124-artifact analyze flow, and the GitHub App + Action gating story.
- [ ] **MUST · S** — Pricing page (`PlansPage.tsx`) audit: every "Coming soon" cell on the comparison table either becomes a real feature for v1 or gets removed. Don't ship a pricing table with placeholders.
- [ ] **MUST · S** — Tools Index page: every `coming_soon` entry either gets a working GUI or is hidden until v1.1. Better to show 5 working tools than 9 mixed.
- [ ] **SHOULD · S** — `AccountPage.tsx` (629 LoC): walk every "save" handler under prod-load to catch the billing edge cases (proration, tier downgrade with active subscription, seat invite expiration). The page is functional but billing edges are where users get angry.
- [ ] **SHOULD · S** — Empty-state copy review across all pages. Common cause of "looks broken" reports.
- [ ] **COULD · S** — `prefers-color-scheme: dark` rendering pass — dark-mode tokens exist but visual review on every page would catch contrast/hierarchy bugs.

---

## D. Operational readiness (MUST)

- [ ] **MUST · M** — Production env audit. Every var in `apps/api/src/env.ts ENV_SPEC` either has a real prod value or is explicitly opted out. Use a checklist commit, not a verbal "yeah it's set."
- [ ] **MUST · S** — Secret rotation runbook. Document how to rotate `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `GITHUB_WEBHOOK_SECRET`, `R2_SECRET_ACCESS_KEY`, `ADMIN_API_KEY`. The runbook lives in `mcp/operations.md` (new file) or repo-root `RUNBOOK.md`.
- [ ] **MUST · S** — Uptime monitor on `/health` (UptimeRobot free tier or Better Uptime). One alert channel (PagerDuty / email / SMS).
- [ ] **MUST · S** — Graceful shutdown verified under SIGTERM in production. We have the handler; verify with a load test that connection drain works.
- [ ] **MUST · S** — DB backup automation: nightly `axis.db` snapshot to R2 (which we now own via `iliad_object_storage`). Use the existing presign path.
- [ ] **SHOULD · S** — Log aggregation (Logflare / Better Stack). Right now we log to stdout; in production that means SSH-and-tail.
- [ ] **SHOULD · M** — `/metrics` Prometheus endpoint scraping (Grafana Cloud free tier). The endpoint exists; nothing scrapes it.
- [ ] **SHOULD · M** — Status page at `status.axis-iliad.com` (Instatus free tier or Atlassian Statuspage). Auto-updated from the uptime monitor.
- [ ] **COULD · M** — On-call rotation + paging (PagerDuty / Pager.ly). Only matters once we have paying customers asleep.
- [ ] **MUST · S** — Incident response template (markdown file in repo). "Severity 1: data loss / data leak. Severity 2: total outage. Severity 3: degraded perf." Defines who acks, who fixes, who writes the postmortem.

---

## E. Legal / compliance (MUST — block-on-launch)

- [ ] **MUST · S** — Privacy Policy. `TermsPage.tsx` mentions "Privacy" in passing but does not have GDPR/CCPA-aware language. Needs a dedicated privacy page or section. **This is a launch blocker for any EU/CA visitor.**
- [ ] **MUST · S** — Subprocessor list: enumerate every SaaS in the data path (Stripe, Resend, OpenAI, Firecrawl, R2/Cloudflare, GitHub, Render — anyone else). Lives in privacy policy.
- [ ] **MUST · S** — Cookie banner if we ship any analytics or session cookies. If we don't, document that.
- [ ] **SHOULD · S** — Data Processing Agreement (DPA) for enterprise sales. Standard template + signature flow.
- [ ] **SHOULD · S** — Attribution / OSS license aggregation. Generate `LICENSES.txt` from `pnpm ls --json --long --depth 0` for the production deploy.
- [ ] **MUST · S** — Resend domain verification for `RESEND_FROM_ADDRESS`. Without this the `iliad_transactional_email` tool sends mail that hits spam folders.
- [ ] **COULD · M** — AXIS trademark filing (intent-to-use). Conversation with legal, not engineering.

---

## F. Distribution + discovery (MUST/SHOULD)

- [ ] **MUST · S** — Publish `@axis/mpp` to npm (README + LICENSE prepped in session 101). `pnpm --filter @axis/mpp publish --access public`.
- [ ] **MUST · S** — Publish `@axis/sdk` to npm (test suite landed session 097). Same flow.
- [ ] **MUST · S** — Submit to MCP registry. `mcp-publisher publish` (run from repo root) reads `server.json` at the repo root — see `LAUNCH_RUNBOOK.md`'s Step 6. Requires GitHub auth. (H-Phase-A cycle 14: this line previously named `apps/api/mcp-server.json`, a second, stale, unread manifest from the same day server.json was created; deleted as dead weight — `mcp-publisher` has no mechanism to pick up a differently-pathed/named file.)
- [ ] **MUST · S** — Register the GitHub App at `github.com/settings/apps/new` using `.github/app-manifest.json` (manifest prepped session 103). Without this, `/v1/github/webhook` never receives events.
- [ ] **MUST · S** — Set `GITHUB_WEBHOOK_SECRET` in production env (currently returns 503 until set — GitHub auto-retries, no message loss, but no installs work either).
- [ ] **SHOULD · S** — Publish the compliance-check Action to GitHub Marketplace. `axis-iliad/compliance-check@v1` listing.
- [ ] **SHOULD · S** — Submit to Glama.ai and Smithery.ai (manual review forms, prepped session 095).
- [ ] **SHOULD · M** — Sample agent repo: a Claude Code starter that uses AXIS via MCP for an end-to-end demo. ~200 LoC, public GitHub repo.

---

## G. Launch mechanics (SHOULD)

- [ ] **MUST · S** — Demo video. 60–90 seconds, screen recording: paste GitHub URL → 124 artifacts → drag AGENTS.md into Cursor → cursor uses the context. Without this the launch is words, not pictures.
- [ ] **MUST · S** — Press kit: logo SVG, 3–5 screenshots, 1-pager PDF, founder bio + photo, contact email.
- [ ] **SHOULD · S** — Pre-launch waitlist email (if there's a list) — 48h before launch.
- [ ] **SHOULD · S** — `r/mcp` launch post (the obvious community for MCP server announcements).
- [ ] **SHOULD · S** — X (Twitter) launch thread with demo GIF.
- [ ] **SHOULD · S** — `Show HN` submission. Best window: Tuesday 8:00 AM PT.
- [ ] **SHOULD · M** — First 50 customers free-credit offer (already documented in session 094). Tracking via the existing referral system.

---

## H. Post-launch monitoring (SHOULD)

- [ ] **SHOULD · S** — Define SLOs for week 1: error rate < 1%, p95 latency < 500 ms on `POST /v1/analyze`, 99.9 % uptime on `/health`.
- [ ] **SHOULD · S** — User feedback channel: enable GitHub Discussions on the repo. Or Canny / Linear public roadmap.
- [ ] **SHOULD · S** — Weekly review template: which MCP tools agents actually call (we have `logMcpCall` already), which generators get re-run, what causes 4xx/5xx.
- [ ] **COULD · M** — A/B test plan for analyze pricing — should it be $0.50 / $0.25 lite / $1.00 deep? The `iliad_analytics` planned-capability stub becomes the v1.1 home for this when it's owned.

---

## v1 launch readiness scorecard (proposed cut line)

Ship v1 when:
- All `MUST` items above are green
- At least 60% of `SHOULD` items are green
- Zero `DEFER` items pretending to be ready

The 4 proxied `iliad_*` tools ship in v1 **with the provider chip**. The 12 planned-capability stubs do NOT ship in v1 (hidden from `tools/list`).

Tool catalog at v1 launch (15 tools, all real):
1. `analyze_repo` — full analyze
2. `analyze_files` — inline analyze
3. `list_programs` — discovery
4. `get_snapshot` — retrieval
5. `get_artifact` — retrieval
6. `prepare_agentic_purchasing` — composite
7. `closer` — packaging
8. `search_and_discover_tools` — discovery
9. `discover_commerce_tools` — discovery
10. `discover_agentic_purchasing_needs` — discovery
11. `improve_my_agent_with_axis` — composite
12. `iliad_object_storage` — owned
13. `iliad_vector_database` — owned
14. `iliad_embeddings` — proxy (OpenAI, with chip)
15. `iliad_web_research` — proxy (Firecrawl, with chip) — or owned via Playwright if item B converts in time
16. `iliad_web_research_crawl` — proxy (Firecrawl, with chip)
17. `iliad_transactional_email` — proxy (Resend, with chip) — or owned via SMTP if item B converts in time
18. `get_referral_code` / `get_referral_credits` — commerce

That's 17–18 honest tools instead of 27 mixed. Better discovery story; nothing to be ashamed of.

---

## Estimated v1 timeline (assuming one engineer)

- **MUST-only sprint**: ~5 working days. Mostly cleanup + legal + ops.
- **MUST + 60% SHOULD**: ~10 working days.
- **All-green including owned-conversion of web_research and transactional_email**: ~3 weeks.

Cut at the timeline that matches the launch deadline. Don't ship-creep MUST items; defer SHOULDs aggressively if needed.

---

_Generated for axis-iliad as the v1.0 launch checklist. Update on each session — every commit that closes a checkbox becomes a v1 readiness milestone._
