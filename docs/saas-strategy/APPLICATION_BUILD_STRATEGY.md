# Application Build Strategy — 20 programs, 20 applications, zero open questions

**Supersedes the merger-based consolidation.** CONSOLIDATION.md collapsed 20 programs
into 9 products by absorbing weak ones into strong ones. The owner rejected that
(2026-07-31): each program grows into **its own standalone application** that builds a
specific part of a user's full stack. No mergers. The hub (Iliad MCP) stays the free
vending machine; each program must become a snack worth buying on its own.

**The principle, applied twenty times:** an artifact *describes* work; an application
*does* the work, *verifies* its own output, and *keeps it current* when the repo
changes. Every program today stops at "describes." Each candidate below adds the
program's version of three mechanics:

- **Apply** — output lands as a PR, deploy, render, or live endpoint. Never a report.
- **Verify** — the program proves its own output (build it, run it, grade it) before
  handing it over. Nobody else in this space does this; it is the defensible claim.
- **Watch** — subscribe to the repo, re-run on change. This is what makes
  `max_snapshots_per_month` the honest billing axis (owner decision, 2026-07-31) and
  turns every one-shot artifact into a subscription.

## Dependency policy — resolved, standing, no further discussion

Owner's standing answer (2026-07-31), recorded in memory as
`dependency-policy-program-apps`: **apply the appropriate dependency per program for
peak-performance output; open source where it is the best option available.**
CLAUDE.md's "no dependencies without discussion" is satisfied by this document — the
table below IS the discussion record. Paid licenses are allowed but flagged as owner
purchase actions. The loop must not stall on any dependency question in this
workstream; the answer is always the table below.

### Shared substrate (platform plumbing — NOT product mergers)

Three capabilities every application needs, built once. This is infrastructure the 20
apps stand on, not a collapse of their identities.

| Substrate | What it is | Dependency (license) | Why this one |
|---|---|---|---|
| **Watch/queue** | Repo subscriptions + durable job queue driving every re-run | `pg-boss` (MIT) | Postgres-backed — rides the existing Neon instance; no new infra service, survives restarts, already-proven pattern |
| **Apply channel** | PR-writer: branch, commit, open PR against the user's repo | `@octokit/rest` (MIT) + existing `github-token-store` | The estate already stores GitHub tokens and receives push webhooks (`/v1/github/webhook`); this closes the write half |
| **Verify harness** | Per-program `verify()` contract: run the check, attach evidence to the output bundle | none (internal) | The contract is ours; each program plugs in its own verifier below |

### Per-program dependency table

| # | Program | Named dependency (license) | Flag |
|---|---|---|---|
| 1 | skills | substrate only; LLM via existing AXIS-hosted inference | — |
| 2 | mcp | none new — native MCP code, multi-tenant on Render | — |
| 3 | deploy | Docker daemon (CI/worker) + `hadolint` external binary (GPL-3, invoked not linked) | — |
| 4 | closer | `@octokit/rest` + `conventional-changelog` (MIT) + npm CLI | — |
| 5 | theme | `style-dictionary` (Apache-2.0) + `culori` (MIT) | — |
| 6 | frontend | `eslint` custom plugin (MIT) + existing AXIS LLM inference | — |
| 7 | seo | `googleapis` (Apache-2.0, Search Console) + `schema-dts` (Apache-2.0) | needs owner's GSC property auth |
| 8 | debug | plain REST to Sentry API — deliberately no SDK | user connects their Sentry token |
| 9 | optimization | plain REST to OpenAI/Anthropic usage endpoints | user connects provider admin keys |
| 10 | search | existing (pgvector, repo-parser) | — |
| 11 | artifacts | existing R2 (`iliad_object_storage`) + `esbuild` (MIT) | — |
| 12 | superpowers | `@octokit/rest` workflow_dispatch (substrate) | — |
| 13 | agentic-purchasing | PAI'D sibling + Stripe test-mode (both existing) | live-counterparty verify closes the ap2 disclosure |
| 14 | brand | `vale` external binary (MIT) + AXIS LLM for rule synthesis | — |
| 15 | marketing | existing Resend + pg-boss scheduling (substrate) | — |
| 16 | notebook | existing (`iliad_embeddings` + vector DB) | — |
| 17 | obsidian | none — filesystem/git output | — |
| 18 | canvas | `D2` external binary (MPL-2.0) — single Go binary, server-friendly; Mermaid rejected: needs headless Chromium | — |
| 19 | remotion | `@remotion/renderer` — **PAID: Remotion company license required at our scale** | OWNER PURCHASE before launch; best available for programmatic React video, applied per standing answer |
| 20 | algorithmic | `sharp` (Apache-2.0) + `@napi-rs/canvas` (MIT) | — |

## The twenty applications

Each entry: the job it owns → Apply / Verify / Watch stages → acceptance criterion a
Sonnet-5-level session can self-check. Stages are ordered; a program ships value at
each stage, not only at the end.

1. **skills — agent onboarding that never rots.** A: on merge, re-derive AGENTS.md/
   CLAUDE.md/.cursorrules and open the PR itself. V: generated rules lint clean
   against the repo they describe (no dead paths, no stale counts). W: push-webhook
   subscription. *Accepts when: a merged change to a watched repo produces a correct
   AGENTS.md-refresh PR with zero human steps.*
2. **mcp — hosted MCP endpoints.** A: repo in → live per-account MCP endpoint out
   (multi-tenant route on the existing server), schemas derived from code. V: every
   published tool schema round-trips a tools/call against the live endpoint. W:
   schema re-sync on merge. *Accepts when: a user's repo gets a working MCP URL an
   agent can call without the user running anything.*
3. **deploy — proven deploys.** A: emit Dockerfile/compose/render.yaml as today. V:
   **build the emitted Dockerfile, boot it, hit the healthcheck** in the worker;
   attach the build log to the bundle; hadolint when no daemon. W: re-verify on
   dependency-file changes. *Accepts when: no Dockerfile leaves the system unbuilt.*
4. **closer — release operator.** A: cut the actual release — tag, conventional
   changelog, GitHub Release, npm publish where configured. V: dry-run publish +
   artifact checksum before the real one. W: release-on-merge-to-main policy.
   *Accepts when: one call takes a repo from merged to published with evidence.*
5. **theme — token sync.** A: detect code↔token drift on push, open the fix PR
   (style-dictionary build both directions). V: emitted theme.css compiles and every
   token resolves; contrast checks via culori. W: push subscription. *Accepts when: a
   hand-edited hex in code produces a correcting PR.*
6. **frontend — the v0 answer.** A: generate components that satisfy the repo's own
   extracted conventions (AXIS LLM), in-repo style. V: the generated component lints
   clean against the program's own frontend-rules ESLint plugin — the rules and the
   generator ship as one loop. W: PR-lint every change against the rules. *Accepts
   when: prose rules are enforced by a linter and the generator passes its own lint.*
7. **seo — applies what it recommends.** A: write the meta tags, inject JSON-LD
   (schema-dts typed), submit the sitemap — as a PR. V: structured-data validation
   passes on the rendered output. W: Search Console coverage/ranking deltas pulled on
   schedule. *Accepts when: recommendations land as merged tags, not a report.*
8. **debug — wired to real incidents.** A: ingest the user's Sentry stream; on
   incident, draft the postmortem from real events using its own tracing rules. V:
   every playbook step references a real symbol/log line in the current repo. W:
   incident webhook. *Accepts when: a real Sentry event produces a grounded draft.*
9. **optimization — live meter, not estimate.** A: pull actual provider usage,
   attribute spend to prompts/routes from the repo's own call sites. V:
   reconciliation — attributed total matches provider invoice within tolerance. W:
   scheduled pulls + regression alerts. *Accepts when: it reports real dollars.*
10. **search — the vending machine itself.** Stays free (owner-confirmed funnel). A:
    always-current index behind the hub MCP. V: existing determinism suite. W:
    incremental re-index on push. *Accepts when: index freshness ≤ one merge behind.*
11. **artifacts — embed platform.** A: host the generated widget at a versioned R2
    URL (esbuild bundle), not just emit the .tsx. V: bundle loads headless without
    console errors. W: rebuild on relevant merges. *Accepts when: the embed snippet
    points at a live, current URL.*
12. **superpowers — executable automations.** A: registry entries become dispatchable
    GitHub Actions jobs (test-gen, refactor sweeps) triggered via workflow_dispatch.
    V: each automation runs green in a worktree before registration. W: CI-triggered.
    *Accepts when: a registry entry can be run, not just read.*
13. **agentic-purchasing — compliance monitor.** A: re-grade on every push; alert on
    readiness regression. V: **golden vectors verified against live PAI'D + Stripe
    test-mode** — closes packages/ap2's self-disclosed never-tested-live gap, which is
    a precondition for charging $99/mo. W: push subscription. *Accepts when: a
    compliance-breaking diff raises an alert before merge.*
14. **brand — voice linter.** A: enforce voice-and-tone on user-facing strings in PRs
    via vale rules the program synthesizes from its own guide. V: the guide's own
    examples pass their own rules. W: PR-lint. *Accepts when: an off-voice string
    fails CI with a citation to the guide.*
15. **marketing — connected to a channel.** A: push the generated sequence into
    Resend (existing rail); schedule via pg-boss. V: test-send round-trip before any
    real audience. W: send/conversion stats feed back into the funnel map. *Accepts
    when: a campaign brief becomes scheduled sends with tracked results.*
16. **notebook — living knowledge base.** A: answer questions with citations into
    current code (existing embeddings + vector DB). V: every citation resolves to a
    real file:line in the current snapshot. W: re-embed changed files on merge.
    *Accepts when: answers cite code that exists today, not at snapshot time.*
17. **obsidian — vault sync.** A: write and incrementally maintain the actual vault
    (filesystem/git), not a description of one. V: no broken wikilinks; graph parses.
    W: incremental update on merge. *Accepts when: the vault updates itself.*
18. **canvas — rendered, current diagrams.** A: real SVG/PNG via D2, committed into
    the README by PR. V: D2 compile succeeds; image referenced actually renders. W:
    redraw when architecture signals change. *Accepts when: the README diagram is a
    picture, and it is current.*
19. **remotion — rendered video.** A: deliver the mp4 changelog/demo per release via
    @remotion/renderer in the worker — user needs zero Remotion knowledge. V: render
    completes; duration/resolution match the scene plan. W: release-triggered.
    *Blocked on owner purchasing the Remotion company license — the one paid
    dependency in this table.* *Accepts when: a release produces a watchable file.*
20. **algorithmic — rendered collections.** A: ship the rendered outputs (sharp/
    canvas), parameter matrix exercised, not code the user must run. V: every
    variation in the matrix renders without error. W: optional (lowest priority;
    still the least stack-shaped snack — earns its keep as rendered output or not at
    all). *Accepts when: the collection exists as images.*

## Build order (encoded as begin.yaml scores — the loop executes by score)

- **Wave 0 (95–92):** registry rework to 20 standalone products (kills the merger
  map), then the three substrate pieces. Everything depends on these.
- **Wave 1 (90–88):** deploy (verify-heavy), skills (watch-heavy), theme
  (apply-heavy) — one proof of each mechanic, reusable by all that follow.
- **Wave 2 (86–81):** mcp, closer, search, artifacts, canvas, superpowers — shortest
  distance from current output to application.
- **Wave 3 (79–74):** seo, frontend, debug, optimization, notebook, obsidian —
  integration-heavy, each needs a user-side connection (GSC, Sentry, provider keys)
  or an LLM loop.
- **Wave 4 (72–68):** agentic-purchasing (live-counterparty gate), brand, marketing,
  remotion (license gate), algorithmic.

Superseded: `spoke_03_grain_merge_into_embed` is cancelled — frontend grows on its
own (entry 6). `spoke_01`'s product registry survives but must be reworked to 20
products with no `absorbs` semantics (Wave 0). `spoke_02` (deploy verify) and
`spoke_07` (ap2 live verification) are absorbed into app_13/app_10's fuller scope.
Landing pages (`spoke_05`) and scoped runs (`spoke_06`) remain valid as written.

## Standing gates the scores cannot clear (unchanged)

- Recurring billing unbillable until the Terms change effective 2026-08-15.
- Per-product entitlement schema exists (built 2026-07-31) but is uncommitted pending
  the tier-cap full-suite run; the 20-product registry rework lands with it.
- 20 subdomains need DNS/TLS/Pages via the owner (browser-only OAuth).
- Remotion company license: owner purchase.
- User-side auth for seo/debug/optimization: each needs a connect flow; build the
  flow, don't fake the data.
