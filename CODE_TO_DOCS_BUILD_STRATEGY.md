# Code -> Docs Build Strategy

## Status (as of 2026-07-07)

**18 of 19 work-orders landed** (WO-01 through WO-16, WO-18, WO-19 — all have real `feat(...)` implementation commits, confirmed against git history, not just planning docs).

**WO-17 (`assetforge-prove`) is the only one not built** — deliberately deferred (flakiest external surface, correctly ranked last in Phase 4). Its credential-sourcing method is already resolved and recorded: reuse AXIS 3D Foundry's Render-hosted `HF_TOKEN` (fine-grained, named "foundry") rather than provisioning a new one — see `docs/build-plan/WO-17-assetforge-prove.md`. Pick this up when assetforge work resumes.

This master plan and the individual WO specs in `docs/build-plan/` are otherwise unchanged below — they remain accurate as the historical spec for what was built and why.

---

**Doctrine:** where the docs claim more than the code delivers, close the gap by **building the code up**, not by dialing the docs down. This plan turns every overstated/aspirational documentation claim (from the full doc-vs-code audit) into a **Sonnet-5-executable work-order** whose acceptance test, when green, makes the claim literally true. Where a claim can *never* be made true by code (legal conclusions, unfalsifiable superlatives), it is reworded up front — not built.

**Deliverables:** this file (the master plan) + **19 work-order specs** in [`docs/build-plan/`](docs/build-plan/). Each spec is self-contained: current state (file:line), target state, files to create/edit, real interfaces, and pass/fail acceptance tests where **DONE == the claim is true**. 17 were designed + adversarially verified by a multi-agent workflow; 2 (`WO-18 ce3`, `WO-19 revenue-mrr-tracker`) were recovered by hand from the same grounding.

**Key honesty signal:** the verify pass found almost every WO `fully_closes_claim: false` — i.e., even after building, a residual caveat remains (an external gate, or the literal wording overreaches). So every WO pairs *build* with *reword the residual*. Nothing here lets a marketing sentence outrun its acceptance test.

---

## The honesty rule (governs go-live for every claim)
> A documentation claim may be published (or stay published) **only** when its backing work-order's acceptance test is green in CI, **and** — for any externally-gated WO — the runtime **feature-detects the gate and self-downgrades** to an honest not-configured/degraded state (`configured:false`, `settleOverageCash -> null`, `skipIf`, an "unreachable" message) until the gate is satisfied, so the marketing sentence is emitted **only from the configured code branch**. No claim ships ahead of a passing, non-degraded acceptance. Claims flagged *implementable-false as worded* (`dispute-win-model`, `perf-benchmark`, direct-VTS in `network-tokenization`) must be **reworded down** to what the code proves before their WO ships. `cannot_build` claims are reworded in Phase 0 — never gated-then-shipped.

---

## Phase 0 — Honesty triage (reword, do not build) — do first
No code depends on this; it stops the live-false-claim bleed immediately. Reword these (they cannot be made true by any code):

| Claim | Where | Reword to |
|---|---|---|
| **"MTL-safe" / "MTL-safe first-party"** | ONE_PAGER, ACCELERATOR | mechanism only: "funds settle to the founder's own Stripe via Stripe Connect; Iliad never takes custody of third-party funds" — no legal-safety assertion. |
| **"Visa-Grade" compliance kit** | CLAUDE.md | "aligned to Visa's published scheme rules (not Visa-certified/endorsed)". |
| **"0ms vs 200-800ms Visa IC" / `latency_ms:0, api_calls:0`** | CLAUDE.md | "adds no external network round-trip; local median <X>ms measured by perf-benchmark (WO-15); the 200-800ms figure is Visa's own published number, not our measurement." |
| **"Highest signal-to-noise in the MCP ecosystem" / "Faster, Deterministic, Lower Overhead"** | CLAUDE.md marketing | drop the comparative superlatives or reword to specific self-referential measures. (**"Deterministic output" stays** — it is test-backed.) |

Also in Phase 0: the stale-count sweep already tracked by `SPEC-12-launch-claims-fact-pass.md` (86/102/137/27/15/18/99/133 -> 140/20/29/148/v0.5.3) and the odyssey `CLAUDE.md` fabrications (`win_probability_model`, the `visa_compliance_kit` JSON envelope) — remove/reword; `win_probability_model` becomes true only via WO-09's *heuristic* rewording.

## Phase 1 — Revenue rail to first dollar
Build truthful pricing + the widest code-true in-band collection, then flip the live-cash/settlement claims on as their external gates land.

| Rank | WO | Spec | Tier | Gate |
|---|---|---|---|---|
| 1 | `billing-tiers-4` | [WO-01](docs/build-plan/WO-01-billing-tiers-4.md) | A | none — you cannot honestly charge the advertised Free/Starter/Pro/Growth tiers until the constants are real |
| 2 | `inband-phase2` | [WO-02](docs/build-plan/WO-02-inband-phase2.md) | A | none (honest degrade) — extends in-band settlement from 3 tools to the whole paid surface |
| 3 | `live-collection-fix` | [WO-03](docs/build-plan/WO-03-live-collection-fix.md) | B | `STRIPE_SECRET_KEY` in Render + Stripe **SPT** capability — the live "402 -> pay -> 200, no human" claim |
| 4 | `paid-rail-integration` | [WO-04](docs/build-plan/WO-04-paid-rail-integration.md) | B | verified PAI'D endpoints — makes "PAI'D -> founder's Stripe" real |
| 4b | **`revenue-mrr-tracker`** | [WO-19](docs/build-plan/WO-19-revenue-mrr-tracker.md) | A | none — instrumentation capstone: MRR/revenue derived from **settled payments**, not a tier estimate; reads a true **$0** until collection lands, then ticks up. Also the definitive proof WO-03 works. |

## Phase 2 — Compliance kit: documents -> engines
Build `@axis/agentic-compliance` so the heavily-advertised `visa_compliance_kit` block is backed by real, testable engines (reword where the literal claim is un-buildable).

| Rank | WO | Spec | Note |
|---|---|---|---|
| 5 | `compliance-grader-real` | [WO-05](docs/build-plan/WO-05-compliance-grader-real.md) | most-exposed compliance claim; keyword-scan -> 8 real validators |
| 6 | `sca-exemption-engine` | [WO-06](docs/build-plan/WO-06-sca-exemption-engine.md) | 7-priority SCA decision engine, deterministic |
| 7 | `ap2-tap-ucp-adapters` | [WO-07](docs/build-plan/WO-07-ap2-tap-ucp-adapters.md) | schema-conformant codecs; reword "certified interop" |
| 8 | `dispute-lifecycle` | [WO-08](docs/build-plan/WO-08-dispute-lifecycle.md) | Stripe dispute rail live; VROL/RDR/CDRN behind `AXIS_ENABLE_VROL` |
| 8b | **`ce3-evidence-assembler`** | [WO-18](docs/build-plan/WO-18-ce3-evidence-assembler.md) | real CE-3.0 assembler (10.4-only); the packet WO-08 submits |
| 9 | `dispute-win-model` | [WO-09](docs/build-plan/WO-09-dispute-win-model.md) | heuristic scorer; reword "probability model" (no outcome data exists) |

## Phase 3 — Sovereign capabilities & readiness surface
Turn web-page capability claims into real deterministic tools; present the Phase-2 engines as MCP capabilities, not documents.

| Rank | WO | Spec | Note |
|---|---|---|---|
| 10 | `readiness-real-analysis` | [WO-10](docs/build-plan/WO-10-readiness-real-analysis.md) | the "0->100 / production-ready" trust claim -> real content analysis (no tautology) |
| 11 | `sovereign-embeddings` | [WO-11](docs/build-plan/WO-11-sovereign-embeddings.md) | **the one WO that fully closes** — owned GGUF embeddings, retires the OpenAI proxy |
| 12 | `sovereign-web-research` | [WO-12](docs/build-plan/WO-12-sovereign-web-research.md) | owned crawler, retires the Firecrawl proxy |
| 13 | `commerce-engines-as-mcp-tools` | [WO-13](docs/build-plan/WO-13-commerce-engines-as-mcp-tools.md) | registers the Phase-2 engines as metered MCP tools; bumps counts |

## Phase 4 — External-gated distribution & benchmarks
Everything whose headline is blocked on a credential / partnership / flaky third party — built to degrade honestly, doc-gated until the dependency lands.

| Rank | WO | Spec | Gate |
|---|---|---|---|
| 14 | `network-tokenization` | [WO-14](docs/build-plan/WO-14-network-tokenization.md) | Stripe-adapter path only; direct VTS/MDES needs a Token Requestor ID (uncodeable) |
| 15 | `perf-benchmark` | [WO-15](docs/build-plan/WO-15-perf-benchmark.md) | measures the Phase-2 engines' latency to source the "no round-trip" claim |
| 16 | `axis-iliad-cli` | [WO-16](docs/build-plan/WO-16-axis-iliad-cli.md) | npm publish credential; keep the install doc dark until published |
| 17 | `assetforge-prove` | [WO-17](docs/build-plan/WO-17-assetforge-prove.md) | **NOT BUILT — deferred.** `HF_TOKEN` + live HF Spaces (flakiest surface; last). Credential method resolved (reuse Foundry's Render `HF_TOKEN`), not yet executed. |

---

## Critical path (to first revenue + closing the highest-exposure public claims)
`billing-tiers-4` -> `inband-phase2` -> `live-collection-fix` -> `paid-rail-integration` -> `revenue-mrr-tracker` (proves the dollar) ; and in parallel `compliance-grader-real` -> `readiness-real-analysis` (the two highest-exposure public trust claims).

## Packages this program introduces/changes
- **NEW `@axis/agentic-compliance`** — SCA engine, 8-check grader, dispute heuristic scorer, CE-3.0 assembler, AP2/TAP/UCP codecs, VROL/RDR/CDRN + Stripe dispute client, network-token (Stripe adapter) reader, perf-benchmark harness. All deterministic; gated features self-downgrade to `configured:false`.
- **NEW `@axis/embeddings`** — sovereign local GGUF embedding backend (model-gated tests via `skipIf`).
- **NEW `@axis/web-research`** — sovereign fetch/extract/crawl as an MCP tool.
- **NEW `axis-iliad`** (published bin, `apps/cli`) — analyze/export/github/status; install doc dark until publish.
- **NEW `@axis/assetforge`** — HF-Spaces bridge with live/canary tests gated on `HF_TOKEN`.
- **CHANGED** `@axis/mpp` (in-band settlement across the paid surface), `@axis/paid-client` (wallet/debit + `account_id -> developer_id` mapping, Connect wiring), `@axis/snapshots` (settled-revenue aggregations + `payment_receipts`), `apps/api` (register tools, readiness analyzer, 4-tier billing, collection fix), `apps/web` (pricing, readiness display, sovereign tool pages, honesty-gated copy), `examples/axis-toolbox-examples` (emit the real computed readiness).

## How a Sonnet 5 agent uses this
1. Pick a WO spec from `docs/build-plan/` (start at rank 1, respect `Depends on`).
2. Implement to the **acceptance tests** — those ARE the definition of done.
3. Honor each spec's **Tier**, **External gates**, and **New deps** (the repo forbids new runtime deps without discussion — a spec that lists one must be raised first).
4. **Only after** the acceptance test is green + non-degraded, unlock the corresponding doc claim (per the honesty rule). If the WO carries a residual caveat, that caveat ships in the doc.

_Generated from the `code-to-docs-build-strategy` workflow (19 work-orders) + the full doc-vs-code audit._
