# Program Portfolio — 21 programs, where each one actually stands

**Generated 2026-08-17 from code and ledger, not from prose.** Every number below was
read out of the built registry (`PROGRAM_ORDER`, `GENERATOR_PROGRAMS`,
`PRODUCT_REGISTRY`) or out of `begin.yaml`'s candidate log. Nothing here is carried
over from an older document — this repo has a standing rule that docs drift from
runtime and must be diffed against `counts.ts` rather than trusted for reading clean.

**Portfolio totals (measured):** 21 programs · 147 generators · 37 MCP tools ·
167 endpoints · 2 free programs (search, obsidian) · 19 paid.

---

## How "% complete" is scored here

A percentage with no rubric is a vibe. This one is mechanical, so you can audit it.

`docs/saas-strategy/APPLICATION_BUILD_STRATEGY.md` defines the difference between an
artifact and an application: *"an artifact **describes** work; an application **does**
the work, **verifies** its own output, and **keeps it current** when the repo changes."*
That gives five components, 20 points each:

| # | Component | What earns it |
|---|---|---|
| 1 | **Generate** | Emits its artifacts deterministically |
| 2 | **Verify** | Proves its own output before handing it over |
| 3 | **Apply** | Output lands as a PR / build / render / live endpoint — never a report |
| 4 | **Watch** | Re-runs itself when the watched repo changes |
| 5 | **Storefront** | Buyable standalone: own subdomain live, entitlement enforced, program-scoped run |

**Two portfolio-wide facts set the floor and the ceiling:**

- **Floor = 40% for everything.** All 21 programs generate deterministically, and all 21
  pass a structural self-check (the verify-harness substrate, `app_03`, is complete and
  `generate-programs.test.ts` asserts every program's real output passes its own check).
- **Ceiling = 80% for everything.** *No* program scores on Storefront. The 20+
  `<name>.trustfabric.ai` subdomains are provisioned in `PRODUCT_REGISTRY` but not live, and
  program-scoped runs (`spoke_06`) are still open. **Nothing is standalone-buyable today.**
  That single shared gap is worth more than any individual program's remaining work.

  > **CORRECTION 2026-08-17.** The line above originally said this step was "owner-gated and
  > browser-only." **That was wrong, and it was wrong for weeks.** Owner note: *"all necessary
  > api keys to unlock this step are in keys.txt."* Verified against the live API rather than
  > argued: `CLOUDFLARE_ADMIN_API_KEY` verifies **active**, lists **trustfabric.ai**, and
  > **created and deleted a real DNS record** on it; Pages is admin-listable and `axis-web`
  > already serves `iliad.trustfabric.ai`. Adding `<program>.trustfabric.ai` is the *same
  > operation that already succeeded*. The false blocker came from over-generalizing one true
  > but irrelevant fact — Pages **Git-connect** needs browser OAuth — when deploys go by direct
  > `wrangler` upload and never needed it. **Storefront is unblocked and is engineering work.**
  >
  > **Design direction (owner):** layouts build on the avionics language, with continuity
  > across pages and individual per-program favicons that compose into the AXIS' Iliad brand.

Partial credit (10) is given where a mechanic exists but only locally — e.g. a CLI-only
apply that never reaches a hosted surface, by deliberate owner decision.

---

## Portfolio at a glance

| Program | Gens | Price | Tier | % | Missing |
|---|---:|---:|---|---:|---|
| skills | 6 | $9 | paid | **80%** | storefront |
| theme | 5 | $19 | paid | **80%** | storefront |
| canvas | 6 | $15 | paid | **80%** | storefront |
| seo | 6 | $19 | paid | **80%** | storefront (+ GSC auth for the last mile) |
| search | 6 | free | free | **70%** | apply is re-index only; storefront |
| mcp | 19 | $29 | paid | **60%** | watch; storefront |
| deploy | 13 | $19 | paid | **50%** | apply is CLI-local; watch; storefront |
| closer | 16 | $49 | paid | **50%** | apply is CLI-local; watch; storefront |
| superpowers | 8 | $19 | paid | **50%** | apply is CLI-local; watch; storefront |
| agentic-purchasing | 6 | $99 | suite | **45%** | live-counterparty verify; apply; watch; storefront |
| pitch | 3 | $19 | paid | **40%** | apply; watch; storefront |
| artifacts | 11 | $29 | paid | **40%** | blocked on output-shape decision | *react high end*
| frontend | 4 | $19 | paid | **80%** | storefront (apply needs an LLM configured — see note) |
| debug | 4 | $15 | paid | **40%** | apply; watch; storefront |
| optimization | 4 | $29 | paid | **40%** | apply; watch; storefront |
| notebook | 5 | $15 | paid | **40%** | apply; watch; storefront |
| obsidian | 5 | free | free | **40%** | apply; watch; storefront |
| brand | 5 | $15 | paid | **40%** | apply; watch; storefront |
| marketing | 5 | $19 | paid | **40%** | apply; watch; storefront |
| remotion | 5 | $29 | paid | **40%** | license-gated; apply; watch; storefront |
| algorithmic | 5 | $19 | paid | **40%** | apply; watch; storefront |

**11 of 21** have their "become an application" candidate complete. **10** remain open.

---

## The five at 80% — Apply and Watch both shipped

### skills — 6 generators · $9 · `app_11` complete
**Does:** AGENTS.md, CLAUDE.md, .cursorrules, workflow pack, policy pack, model cascade —
the agent-onboarding layer, and AXIS's own self-propagation vector. *yes, and each artifact should have a list of artifiacts in our system, that work together as a development multiplier for the LLM to purchase or present for purchase*
**Applies:** re-derives on watched-repo merge and opens the refresh PR automatically.
**Watches:** `skills-refresh-watcher.ts`.
**Three directions:** (1) onboarding that provably never rots; (2) per-agent-runtime
tailoring beyond the generic pack; (3) the acquisition funnel — every generated file
instructs the next agent to call AXIS.
**Highest-ROI trajectory:** this is the **top-of-funnel product**, not the biggest ticket.
At $9 it is the cheapest paid entry and the file that propagates AXIS into every repo it
touches. Its long-range value is agent acquisition, so optimize for reach and freshness,
never for price.
**Gaps:** storefront. Its own onboarding claims need the same evidence-gating the pitch
program uses, so the generated packs argue from measured repo facts rather than boilerplate.

### theme — 5 generators · $19 · `app_12` complete
**Does:** design tokens, theme.css, guidelines, component theme map, dark-mode tokens.
**Applies:** detects code↔token drift on push and opens the fix PR; WCAG contrast checks.
**Watches:** `theme-token-sync-watcher.ts`.
**Three directions:** (1) bidirectional sync (code→token as well as token→code);
(2) accessibility as an enforced gate, not a report; (3) multi-brand/whitelabel token sets.
**Highest-ROI trajectory:** **the default install for any repo with a GUI and no design
system.** Per the owner's own framing, theme is fundamentally needed by every repo that
has a UI and lacks one — its ceiling is breadth of attach rate, not depth per customer.
**Gaps:** storefront. Shipped without `style-dictionary`/`culori` (hand-rolled to satisfy
the CLI's zero-dependency bundle constraint) — revisit only if token-format breadth
becomes the actual limiter. *build the style dictionary*

### canvas — 6 generators · $15 · `app_24` complete
**Does:** canvas spec, social pack, poster layouts, asset guidelines, brand board, and a
real D2 architecture diagram built from actual cross-directory import edges — never fabricated.
**Applies:** shells out to the real D2 binary, renders SVG, opens a PR with both files.
**Watches:** `canvas-diagram-watcher.ts`, which excludes its own prior output from its own input.
**Three directions:** (1) more diagram classes (sequence, data-flow, deploy topology);
(2) diagrams as a merge gate — fail the PR when architecture drifts from the documented shape;
(3) embeddable/living diagrams rather than committed files.
**Highest-ROI trajectory:** **architecture drift detection.** The diagram is the visible
artifact, but the durable product is "your documented architecture no longer matches your
imports, here is the PR" — that is a recurring, high-trust signal a static diagram can't sell.
**Gaps:** storefront. Only one diagram type today, so the drift-gate thesis is thinly covered.

### seo — 6 generators · $19 · `app_30` complete (A and V; W half owner-gated)
**Does:** SEO rules, schema recommendations, route priority map, content audit, meta-tag
audit, and real injectable `<head>` markup (meta/OG/Twitter + JSON-LD).
**Applies:** injects between markers so re-runs are idempotent; **refuses to open a PR when
the JSON-LD fails validation** — invalid structured data cannot reach a user's site through AXIS.
**Watches:** `seo-apply-watcher.ts`.
**Three directions:** (1) close the loop with Search Console deltas; (2) sitemap submission;
(3) content-quality scoring beyond structural correctness.
**Highest-ROI trajectory:** **the verify half is the moat.** Competitors emit SEO advice;
refusing to ship invalid structured data under the customer's own domain is the defensible
claim. Lead with correctness guarantees, not volume of recommendations.
**Gaps:** storefront. Search Console deltas and sitemap submission both need Google OAuth
plus the owner's GSC property — deliberately not faked with placeholder data.

---

## The middle tier — one mechanic short

### search — 6 generators · **free** · `app_22` complete
**Does:** context map, repo profile, architecture summary, dependency hotspots, symbol
index, repo run stats. Free, deliberately — the vending machine that gets agents in the door.
**Watches:** `search-index-watcher.ts` re-indexes on every push (pgvector-backed), so
freshness stays ≤ one merge behind.
**Apply is partial:** it refreshes an index; it doesn't write anything back to the user.
**Three directions:** (1) search as the free hook that upsells every paid program;
(2) cross-repo/org-wide search; (3) semantic answers over the index rather than retrieval alone.
**Highest-ROI trajectory:** **stay free forever and optimize purely for conversion.** Its
job is acquisition and freshness, not revenue; every improvement should be measured by
paid-program attach rate, never by its own monetization.
**Gaps:** storefront; no write-back surface. Deliberately not wired into the paid/metered
MCP dispatch path (that is the security-sensitive surface).

### mcp — 19 generators · $29 · `app_20` complete
**Does:** the largest generator set after closer — MCP config, registry metadata, protocol
spec + types, implementation guides, connector/capability manifests, monorepo scaffolding,
fintech surface package and domain schema.
**Applies:** a **live, per-account multi-tenant hosted MCP endpoint** — the only program
whose apply stage is a running service rather than a PR.
**Three directions:** (1) broaden hosted tool surface within the security envelope;
(2) registry/marketplace distribution; (3) per-tenant observability and quotas.
**Highest-ROI trajectory:** **the platform play, and the highest ceiling in the portfolio.**
Every other program produces files; this one produces a running endpoint other agents call.
That makes it the natural home for recurring revenue and the anchor of any agent-to-agent story.
**Gaps:** no Watch consumer — a hosted endpoint that doesn't refresh when the repo changes
undercuts its own value. Storefront. Deliberately scoped: it serves filesystem/resource tools
from the latest synced snapshot and **declines** run_build/run_tests/git_* at call time
rather than executing arbitrary customer code server-side.

### deploy · closer · superpowers — apply exists, but CLI-local by design

These three share a shape: their apply stage is real and proven, but runs on the user's
machine, never server-side. That was an explicit owner decision — each executes the target
repo's own scripts (install/build/test, postinstall hooks), and that surface must never
exist inside AXIS's shared API process.

**deploy** — 13 generators · $19 · `app_10` complete. Emits a stack-aware Dockerfile,
compose, `render.yaml`, GHCR push scripts, wrangler configs, a Cloudflare Worker entry and
a qualification report — then **actually builds the image and hits the healthcheck** via
`axis verify-deploy`. *Directions:* (1) verified-deploy as a merge gate; (2) more target
platforms; (3) hosted verification once sandboxing is solved. *Trajectory:* **"the Dockerfile
we gave you provably builds"** — a Dockerfile that doesn't build is worse than none, so
verification is the whole product. *Gaps:* watch; hosted verify; storefront.

**closer** — 16 generators · **$49, the highest-priced product** · `app_21` complete.
Packaging README/LICENSE, Dockerfile, compose, CI + release workflows, five platform
manifests, trust-fabric attestation + merkle proof, packaging report, DISTRIBUTABLE.md,
Makefile. `axis release` decides the next version and changelog from conventional commits
and, only with `--execute`, builds/checksums/tags **locally — never pushes**. *Directions:*
(1) full release operator; (2) supply-chain attestation as the headline; (3) multi-registry
distribution. *Trajectory:* **release engineering as a product** — highest price point,
and attestation/provenance is where enterprise willingness-to-pay actually lives.
*Gaps:* watch; storefront; the push half stays manual by design.

**superpowers** — 8 generators · $19 · `app_25` complete. Workflow registry with
`exec_steps` (a strict subset of *directly executable* commands — prose and unfilled
placeholders excluded), plus `axis verify-automations`, which **runs those steps in order
against a real repo and withholds the workflow file if they fail**. *Directions:*
(1) automations that self-heal; (2) broader step vocabulary; (3) org-wide automation
libraries. *Trajectory:* **"automations that are proven to run before you adopt them"** —
the generated-automation market is full of untested YAML; proof is the differentiator.
*Gaps:* watch; storefront; workflows are `workflow_dispatch`-only and never auto-pushed.

---

## The floor — generate and verify only (40–45%)

Each of these emits real artifacts and self-checks them, but stops at "describes." All
share the same three missing mechanics (apply, watch, storefront), so below is what is
*specific* to each.

### agentic-purchasing — 6 generators · **$99, suite tier** · `app_40` open (45%)
**Does:** purchasing playbook, product schema, checkout flow, negotiation rules, commerce
registry, AP2 interop samples — plus the Visa-grade compliance kit (SCA exemption matrix,
CE 3.0 assembly, dispute lifecycle, network tokenization, 8-check grading).
**Three directions:** (1) continuous compliance monitor that re-grades every push;
(2) live-counterparty proof against PAI'D + Stripe test mode; (3) alerting on readiness regression.
**Highest-ROI trajectory:** **the highest-revenue single product** and the one whose buyers
read disclosures most carefully. Its trajectory is entirely gated on turning
`packages/ap2`'s self-disclosed "never tested live" into a verified claim.
**Gaps:** the live-counterparty verify is the precondition for the $99 price to be honest.
Blocked on test-mode Stripe/PAI'D credentials, which are **not** in `key.txt` (live keys
only) — an owner action, and correctly not worked around.

### artifacts — 11 generators · $29 · `app_23` open, **blocked on a design decision** (40%)
**Does:** generated component, dashboard widget, embed snippet, artifact spec, component
library, PRD, design doc, tasks breakdown, session context, root index.html, capability map.
**Three directions:** (1) bundle widgets with esbuild and host at versioned R2 URLs;
(2) rebuild on push; (3) an embed platform other sites consume.
**Highest-ROI trajectory:** **embeddable, hosted, versioned artifacts** — the only program
whose output could live on someone else's page, which makes it a distribution surface.
**Gaps:** genuinely blocked, not merely unstarted: `generateDashboardWidget` emits JSX
whenever the target repo uses React, with no bundled React/ReactDOM and no mount point, so
there is nothing framework-agnostic to bundle yet. Needs an owner decision — ship a React
runtime, or always emit vanilla-JS widgets. **Standing note: when resumed, bundle the
*quality* widgets specifically, cross-referenced with the Package Quality Judge work.**

### frontend — 4 generators · $19 · `app_31` **80% as of 2026-08-17**
**Does:** frontend rules, component guidelines, layout patterns, UI audit — *and now real
components*. `buildComponentContract` reads the design-token artifact the theme program
actually ships (the fixed **averionics** preset), and components are inferred from that one
source: `temperature: 0`, fixed seed, JSON-schema-constrained.
**Verifies (the part that matters):** every colour the model emits must already exist in the
contract, and the component must survive the frontend program's *own* auditor
(`analyzeUiSurface`). Fail either — invented colour, `div` used as a button, `img` without
alt, `dangerouslySetInnerHTML`, `any` — and the component is **withheld**, not annotated.
**Applies:** `frontend-apply-watcher.ts` opens a PR under the managed `src/components/axis/`
directory. Partial success is the normal case and is handled honestly: passing components
ship, failing ones are named with their reason and never smuggled in.
**Watches:** the 7th `watch-dispatcher` branch; re-runs on push. The request list is fixed,
so a diff means *the design system changed*, not that the model wandered.
**Highest-ROI trajectory:** **the v0 answer, standalone** (owner directive: *not* merged into
artifacts). The defensible claim is not "an LLM wrote your component" — it is **"your design
system provably constrains what it could write."**
**Gaps:** storefront. **Honest caveat that separates it from the other 80% programs:** its
apply stage needs an LLM configured, and degrades to `all_withheld` (no PR) without one —
where skills/theme/canvas/seo need only `GITHUB_TOKEN`. Not yet built: the custom ESLint
plugin that would enforce the same rules on the user's *own* components on every PR.

### debug — 4 generators · $15 · `app_32` open (40%)
**Does:** debug playbook, incident template, tracing rules, root-cause checklist.
**Three directions:** (1) ingest the user's real Sentry stream (plain REST, deliberately no
SDK); (2) draft postmortems grounded in real events; (3) feed fixes back as PRs.
**Highest-ROI trajectory:** **postmortems written from real incidents**, not templates —
the gap between "here's an incident template" and "here's what actually broke last Tuesday
and why" is the entire value.
**Gaps:** requires the user to connect a Sentry token — a per-customer integration step.

### optimization — 4 generators · $29 · `app_33` open (40%)
**Does:** optimization rules, prompt diff report, cost estimate, token budget plan.
**Three directions:** (1) pull real provider usage via plain REST; (2) attribute spend to
prompts/routes from the context map; (3) alert on cost regressions.
**Highest-ROI trajectory:** **a live spend meter attributed to code.** Cost control is one
of the few things buyers renew for without being asked, and estimates become real numbers.
**Gaps:** needs the user's provider admin keys.

### notebook — 5 generators · $15 · `app_34` open (40%)
**Does:** notebook summary, source map, study brief, research threads, citation index.
**Three directions:** (1) answer questions with citations into *current* code;
(2) every citation resolves to a real `file:line`; (3) re-embed changed files on merge.
**Highest-ROI trajectory:** **a knowledge base that cannot go stale, with verifiable
citations** — built entirely on existing embeddings/vector infrastructure, so it is among
the cheapest to finish honestly.
**Gaps:** no new dependencies required; needs the citation-resolution guarantee enforced.

### obsidian — 5 generators · **free** · `app_35` open (40%)
**Does:** skill pack, vault rules, graph prompt map, linking policy, template pack.
**Three directions:** (1) write and incrementally maintain a real vault;
(2) verify zero broken wikilinks; (3) update on merge.
**Highest-ROI trajectory:** free and small — its value is **breadth of reach into the
personal-knowledge-management crowd**, a second acquisition channel alongside search.
**Gaps:** small and self-contained, no new dependency. Its marketing pack still carries an
unverifiable "81/82 Grade A" self-audit claim that is exempted rather than silently
rewritten — an owner content decision.

### brand — 5 generators · $15 · `app_41` open (40%)
**Does:** brand guidelines, voice and tone, content constraints, messaging system, channel rulebook.
**Three directions:** (1) synthesize `vale` rules from the program's own voice guide;
(2) enforce on user-facing strings in PRs; (3) the guide's own examples must pass its own rules.
**Highest-ROI trajectory:** **enforcement** — a voice guide nobody enforces is a PDF. The
self-consistency check (the guide passing its own rules) is a sharp, demonstrable proof point.
**Gaps:** `vale` is an external binary (MIT), invoked not linked.

### marketing — 5 generators · $19 · `app_42` open (40%)
**Does:** campaign brief, funnel map, sequence pack, CRO playbook, A/B test plan.
**Three directions:** (1) push sequences into Resend (an existing rail); (2) schedule via
the pg-boss substrate; (3) feed send/conversion stats back into the funnel map.
**Highest-ROI trajectory:** **a closed loop** — generated sequences that actually send and
whose results return to improve the next generation. All rails already exist.
**Gaps:** must test-send round-trip before touching any real audience.

### remotion — 5 generators · $29 · `app_43` open, **license-gated** (40%)
**Does:** Remotion script, scene plan, render config, asset checklist, storyboard.
**Three directions:** (1) deliver a rendered mp4 changelog/demo per release;
(2) zero Remotion knowledge required of the user; (3) render in the worker.
**Highest-ROI trajectory:** **the artifact becomes the deliverable** — nobody wants a
Remotion script; they want the video.
**Gaps:** **the one paid dependency in the portfolio.** A Remotion company license is an
owner purchase, flagged rather than silently assumed. Do not ship renders before it exists.

### algorithmic — 5 generators · $19 · `app_44` open, lowest priority (40%)
**Does:** generative sketch, parameter pack, collection map, export manifest, variation matrix.
**Three directions:** (1) ship rendered images (sharp + @napi-rs/canvas);
(2) exercise the full variation matrix without error; (3) collection-level export.
**Highest-ROI trajectory:** honestly assessed as **weakest market fit, cheapest to finish**.
It earns its keep as rendered output or not at all.
**Gaps:** rendering pipeline. Reasonable to leave last, or to cut.

### pitch — 3 generators · $19 · `app_45` complete as a *program*, `app_46` open (40%)
**Does:** the newest program (2026-08-13). Pitch deck (markdown + JSON) and slide art
prompts, **argued from measured repo evidence** with an explicit split between "measured"
(from analysis) and "claim" (from docs, audited against measured). Dogfooded three rounds
against a real external repo; caught a genuine contradiction in that repo's own docs.
**Three directions:** (1) accept curated snapshot input (`app_46`); (2) rendered decks, not
just markdown; (3) live backgrounds via the xAI operator path.
**Highest-ROI trajectory:** **evidence-gated claims as a category.** The deck is the vehicle;
the durable asset is a claims engine that refuses to overstate — directly reusable by skills,
marketing, and brand.
**Gaps:** `app_46` is parked on a real design question: how "attested" evidence from a curated
snapshot should be labelled so it is **never laundered into "measured."** Getting that
boundary wrong would undermine the program's entire premise. Price ($19 one-time) may need
revisiting. The public xAI endpoint is deliberately unshipped — pricing is an owner decision.

---

## What actually moves the portfolio

Ranked by leverage across programs rather than within one:

1. **The storefront (`spoke_05` + `spoke_06`).** It is the *only* gap shared by all 21 and
   the sole reason nothing exceeds 80%. **Not blocked — verified 2026-08-17** (DNS write on
   `trustfabric.ai` confirmed by a real create/delete; Pages admin confirmed). What remains is
   engineering: per-program subdomains, the generated landing pages, and program-scoped runs
   (`spoke_06`). Unblocking it raises the entire portfolio at once; no individual program's
   work comes close to that leverage.
2. **Watch consumers for mcp, deploy, closer, superpowers.** Four programs are one mechanic
   from 80%, and Watch is what converts a one-shot artifact into a subscription — the honest
   billing axis the strategy is built on.
3. **`app_40`'s live-counterparty verify.** Gates the $99 product's compliance claims. Owner
   action (test-mode credentials).
4. **The `app_23` output-shape decision.** One design call unblocks an 11-generator program
   and the only distribution surface in the portfolio.
5. **The `app_31` determinism question.** Resolving how LLM inference coexists with the
   byte-determinism law unblocks frontend and sets precedent for every future generative program.

**Standing owner-decision queue — mostly CLOSED 2026-08-17:**

| Item | Status |
|---|---|
| subdomain DNS/TLS | ✅ **not a decision — never was blocked**, keys verified working |
| `app_23` widget output shape | ✅ **decided: React, high-end** (bundle the runtime; do not downgrade to vanilla JS) |
| `app_31` frontend determinism | ✅ **decided: LLM-inferred from a single source** (the repo's extracted design system) — ***PRIORITY 1*** |
| theme `style-dictionary` | ✅ **decided: build it** |
| skills cross-sell | ✅ **decided:** every artifact carries the list of AXIS artifacts that compose with it, as a development multiplier the LLM can buy or present for purchase |
| Remotion license | ⏳ still an owner purchase |
| Stripe/PAI'D test-mode credentials | ⏳ still owner-supplied |
| `app_46` attested-evidence labelling | ⏳ open design question |
| pitch pricing · "81/82 Grade A" claim | ⏳ open content/pricing calls |

**Standing mandate (owner, 2026-08-17):** *no new territory.* Every program reaches the 80%
bar with full QA and is storefront-ready before anything new is started.
