# Compliance Kit — Build Spec (Sonnet-5-codeable work-order)

**Goal:** turn the "Visa-grade agentic compliance kit" from *generated descriptions*
into *real, callable software*, and be honest about the one thing code alone can't buy
(network access). A Sonnet 5 agent can execute all of **Tier A** end-to-end without a
human; **Tier B** is buildable + sandbox-testable but going *live* needs external
credentials/contracts.

## Current state (grounded)

`prepare_agentic_purchasing` (→ `packages/generator-core/src/generators-agentic-purchasing.ts`,
functions `generateAgentPurchasingPlaybook`, `generateProductSchema`, `generateCheckoutFlow`,
`generateNegotiationRules`, `generateCommerceRegistry`) emits the kit as **structured
JSON/YAML** embedded in artifact files: an SCA-exemption *matrix* (~L900–918), CE-3.0
*target codes* (~L767–770, 990–994), network-tokenization/AP2/UCP/TAP *descriptions*
(multiple). These are deterministic **documents an agent reads** — not engines that
decide, assemble, or transact. This spec makes them decide/assemble/transact.

## Target architecture

- New package **`@axis/compliance`** (zero-runtime-dep TS, same conventions as the estate).
- Tier-A engines are **pure functions** `input → decision/packet/grade` with a `proof`.
- The generator calls them so the kit emits a **verified decision** (with proof) instead of
  a description; selected engines are **exposed as new MCP tools** (new metered surface).
- Update `apps/api/src/counts.ts` `MCP_TOOL_COUNT` + the honesty ledger when tools land.

---

## Tier A — pure deterministic engines (build end-to-end now, no external gate)

### WO-C1 · SCA Exemption Decision Engine
- **From:** the described 7-priority matrix.
- **To:** `decideScaExemption(ctx: ScaContext): ScaDecision` — implements the PSD2 SCA-RTS
  exemption hierarchy (TRA by ACS/issuer fraud-rate band, low-value <€30/€100 cumulative,
  low-risk, MIT/recurring, trusted-beneficiary, secure-corporate, one-leg-out) with a
  deterministic priority order, the chosen path, the step-up fallback, expected added
  latency, and a rationale string.
- **Interface:**
  ```ts
  interface ScaContext { amountMinor: number; currency: string; mcc?: string;
    fraudRateBand?: "lt1"|"lt6"|"lt13"|"gte13"; merchantInitiated?: boolean;
    recurring?: boolean; trustedBeneficiary?: boolean; oneLegOut?: boolean;
    cumulativeLowValueCount?: number; cumulativeLowValueMinor?: number; }
  interface ScaDecision { exemption: ScaExemption|"step_up"; priority: number;
    fallback: "step_up"|"none"; addedLatencyMs: number; rationale: string; }
  ```
- **Accept:** table-driven tests hit every exemption branch + the no-exemption→step_up
  default; deterministic (same input ⇒ same decision); the TRA band thresholds match the
  RTS (0.13%/0.06%/0.01% ↔ €100/€250/€500 ceilings).
- **External gate:** none.

### WO-C2 · Compelling Evidence 3.0 Assembler
- **From:** described CE-3.0 target codes (10.4).
- **To:** `assembleCe3(dispute: DisputeCtx, history: Txn[]): Ce3Result` — finds ≥2 prior
  **undisputed** transactions that share ≥2 CE-3.0 data elements with the disputed txn
  (device ID / IP address / shipping address / account/login ID), inside the 120–365-day
  window, and emits the structured evidence packet + an `eligible` verdict + the matched
  element set. Rejects non-qualifying histories with the reason.
- **Accept:** synthesizes qualifying vs non-qualifying histories; matches the CE-3.0
  element/temporal rules exactly; deterministic ordering of the two chosen priors.
- **External gate:** none for *assembly*. (Submission to VROL = WO-C7.)

### WO-C3 · Dispute Win-Probability Scorer
- **To:** `scoreWinProbability(reasonCode: string, evidence: EvidenceState): WinScore` —
  a transparent per-reason-code model (start with a documented logistic/heuristic on
  evidence completeness + CE-3.0 eligibility + AVS/CVV + delivery proof) → `probability`,
  `topMissingEvidence[]`, `recommendedAction` ("represent"|"accept"|"gather"). Structured
  so it can later be **retrained on real represented-outcome data** (leave a `modelVersion`).
- **Accept:** monotonicity tests (more/stronger evidence ⇒ non-decreasing probability);
  deterministic; documented coefficients (no black box).
- **External gate:** none (accuracy improves once real outcomes exist — flag as v0 heuristic).

### WO-C4 · 8-Check Compliance Grader
- **From:** the described 8-check grading.
- **To:** `gradeCompliance(cfg: MerchantAgentConfig): ComplianceGrade` — runs 8 real
  validators (SCA readiness via WO-C1 wiring, AP2 mandate presence/validity via WO-C5,
  tokenization posture, CE-3.0 evidence readiness via WO-C2, dispute-rail wiring,
  idempotency/receipt hygiene, budget-negotiation conformance, refund/cancel path) →
  per-check `pass|warn|fail` + weighted grade + ordered remediation.
- **Accept:** each check independently unit-tested; grade is a pure function of the checks;
  remediation is deterministic + actionable.
- **External gate:** none.

### WO-C5 · AP2 / TAP / UCP Protocol Adapters
- **To:** message **builders + validators** for the open agent-commerce specs — AP2
  intent/cart/payment **mandates** (schema + detached-JWS signature verify), TAP, UCP:
  `buildMandate()`, `validateMandate()`, `verifyMandateSignature()`, encode/decode.
- **Accept:** round-trip encode→validate against each published schema; reject malformed /
  bad-signature; golden-vector tests from the specs.
- **External gate:** none (interop = spec conformance, not network access). `[verify]` each
  spec version is public + stable before pinning.

---

## Tier B — integration clients (build + sandbox-test now; LIVE needs external access)

### WO-C6 · Network Tokenization (VTS / MDES)
- **Buildable by Sonnet 5:** the API client, provisioning/lifecycle state machine
  (provision → active → suspend → resume → delete), request/response models, sandbox tests.
- **⛔ External gate:** direct VTS/MDES access requires being a registered **Token Requestor
  (TRID)** with Visa/Mastercard — a certification + contract, **not code.**
- **✅ Pragmatic real path (recommend in code):** consume **Stripe's network tokenization**
  (Stripe already provisions VTS/MDES network tokens on saved cards) rather than integrating
  the networks directly. So WO-C6 ships as a thin adapter over Stripe network-token features
  + a documented "direct TRID" path left behind a capability flag. This makes the claim
  *true and live* without becoming a token requestor.

### WO-C7 · Dispute Lifecycle (VROL / RDR / CDRN)
- **Buildable by Sonnet 5:** the client + webhook handlers + the state machine that feeds
  WO-C2's CE-3.0 packet into a representment; RDR rule config; sandbox tests.
- **⛔ External gate:** RDR/CDRN run through **Verifi (Visa)** and **Ethoca (Mastercard)**,
  normally provisioned via your **acquirer/PSP** — an account/contract. Code builds the
  integration; the access is a business relationship.
- **✅ Pragmatic real path:** Stripe surfaces dispute/early-fraud-warning webhooks + the
  dispute-evidence API today — wire WO-C2/C3 into **Stripe's dispute API** first (live now),
  and keep the raw VROL/RDR/CDRN client behind a flag for when direct access lands.
- **✅ STATUS (2026-07-07, WO-08 complete):** engines (state machine + representment +
  Stripe/Verifi clients) live in `@axis/agentic-compliance`; the API half is wired:
  `charge.dispute.created/updated/closed` + `radar.early_fraud_warning.created` webhook
  branches (`apps/api/src/stripe.ts` → `apps/api/src/disputes.ts`), a `disputes` +
  `dispute_transitions` store in `@axis/snapshots` (PG migration v32), and the metered
  `assemble_representment` MCP tool. HONEST READING of the manifest claim: **dispute
  lifecycle live via Stripe; VROL/RDR/CDRN integration-ready, gated on acquirer
  (Verifi/Ethoca) access behind `AXIS_ENABLE_VROL`** — the raw Verifi/Ethoca client never
  fakes a submission (it returns `configured:false` or throws NotImplemented). Live Stripe
  operation still requires `STRIPE_WEBHOOK_SECRET` + subscribing the four events in the
  Stripe dashboard (configuration, not code).

### WO-C8 · Wire engines into the product
- Call Tier-A engines from `generateCommerceRegistry` / `prepare_agentic_purchasing` so the
  kit emits a **verified decision + proof**, not a description.
- Expose Tier-A as **new MCP tools**: `sca_exemption_decision`, `assemble_ce3_evidence`,
  `score_dispute_win`, `grade_compliance`, `build_ap2_mandate` — each metered (new revenue).
- Bump `MCP_TOOL_COUNT`, add the tools to `MCP_TOOLS`, keep `PLANNED_CAPABILITIES` honest
  (Tier-B live operation stays "planned/integration-ready" until credentials land).
- **✅ STATUS (2026-07-07, WO-13 complete — two deliberate deviations from the line above):**
  (1) the five engine tools shipped **free** (no auth, read-only, deterministic pure
  compute — no billable resource is consumed; the metered surface is
  `assemble_representment`, which does the actual dispute work), and (2) `score_dispute_win`
  was deliberately **renamed `score_dispute_readiness`** — its description and JSON response
  both state it scores evidence-capture readiness and is NOT a dispute-win prediction; AXIS
  does not publish win-rate estimates. `MCP_TOOL_COUNT` 29 → 35;
  `generateCommerceRegistry` now embeds an engine-derived `verified_decisions` block with a
  sha256 reproducibility proof (`proofDigest` in `@axis/generator-core`).

---

## Honesty ledger (what becomes true, and when)

| Claim | After Tier A | After Tier B code | Live (needs external) |
|---|---|---|---|
| SCA exemption matrix | ✅ real decision engine | — | — |
| CE-3.0 auto-assembly | ✅ real assembler | — | submission live via Stripe/VROL |
| Win-probability model | ✅ transparent v0 model | — | retrained on real outcomes |
| 8-check grading | ✅ real validators | — | — |
| AP2/TAP/UCP interop | ✅ conformant adapters | — | — |
| Network tokenization | — | ✅ client + Stripe adapter | ✅ live via Stripe (direct TRID gated) |
| VROL/RDR/CDRN lifecycle | — | ✅ client + Stripe dispute wiring | RDR/CDRN gated on Verifi/Ethoca access |

**Rule for the agent:** never advertise a Tier-B piece as *live network operation* until the
external access is real. Advertise Tier-A as done once its tests pass; advertise Tier-B as
"integration-ready, live via Stripe" where the Stripe path exists, "planned" otherwise.

## Sequencing for the Sonnet 5 agent

1. Scaffold `@axis/compliance` (package.json, tsconfig extends base, vitest).
2. **WO-C1 → C5** (Tier A) — one PR each, each independently test-locked. No external deps.
3. **WO-C8 (partial)** — wire Tier-A into the generator + ship the new MCP tools + counts.
4. **WO-C6 / C7** (Tier B) — build the clients + sandbox tests + the **Stripe-first live
   path**; leave direct-network paths behind capability flags.

Each WO is self-contained (file paths, TS interface, acceptance tests, external gate) so a
Sonnet 5 agent can pick one up cold. Tier A needs no human; Tier B's *live* switch needs the
owner to secure Stripe features / Verifi-Ethoca access.
