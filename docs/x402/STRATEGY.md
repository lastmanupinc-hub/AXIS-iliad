# x402 Strategy V2 — the rehash (2026-07-20)

> Supersedes the implicit strategy embedded in the x402 onboarding program (Phases 0–3,
> `docs/payment-gates.md`) as the **direction-setting** document. `docs/x402/CONTRACT.md`
> remains the envelope spec for the mppx rail but is corrected by this doc where the two
> disagree (see §7). Fact base: a 6-agent verified audit of the payment stack (wire format,
> auth gates, crypto rails, doc promises, external spec research, adversarial cross-check),
> 2026-07-20. Every load-bearing claim below was verified against code with file:line
> evidence; claims that still need a live check are marked.

## 1. Verdict in one paragraph

Iliad is **not missing payment plumbing — it is missing payment reachability.** The
settlement machinery (challenge signing, credential verification, on-chain broadcast,
receipts, compensation ledger, funnel telemetry) is built end-to-end and live-testable. But
it speaks the **mppx/PaymentAuth dialect** (`WWW-Authenticate: Payment` /
`Authorization: Payment <base64>` / `Payment-Receipt`), settles on the **Tempo chain** while
advertising `x402/usdc/base`, requires an **account + API key at every step including the
payment retry itself**, and its one crypto recipient address has **never been set in
production**. The result: a stock x402 agent (`@x402/fetch`, Cloudflare Agents SDK, AWS
CloudFront buyers) that encounters Iliad today cannot pay it — not because payment is
unimplemented, but because the door it knocks on is a different door. The strategy is
therefore a **translation-and-gating project, not a payments build**: expose a
spec-compliant, anonymous, first-contact 402 in front of the settlement tail we already have.

## 2. The canonical flow, pinned to the actual spec

The agent-side flow (per the x402 Foundation spec, now a Linux Foundation project at
`github.com/x402-foundation/x402`; premier members include AWS, Cloudflare, Anthropic,
Circle, Visa, Mastercard, Stripe):

1. Agent makes a normal anonymous HTTP request. No account, no key, no session.
2. Server returns **HTTP 402** with machine-readable payment requirements.
3. Agent's client library signs a payment payload (typically USDC via EIP-3009
   `transferWithAuthorization`) and **retries the identical request** with a payment header.
4. Server (usually via a **facilitator**) verifies, settles on-chain, returns **200** plus a
   settlement-response header. Funds move payer → seller's own wallet directly; the
   facilitator never custodies.

Two wire generations exist — an implementation must say which it speaks:

| Leg | v1 (widely deployed: `x402-fetch`, `x402-express`, …) | v2 (current spec: `@x402/*` scoped packages) |
|---|---|---|
| 402 requirements | JSON **body**: `{x402Version:1, accepts:[{scheme:"exact", network:"base", maxAmountRequired, resource, payTo, asset, maxTimeoutSeconds, …}]}` | **`PAYMENT-REQUIRED`** header (base64); body non-normative; `accepts[].amount` (renamed), CAIP-2 networks (`eip155:8453`), top-level `resource` object |
| Payment retry | **`X-PAYMENT`** header (base64 PaymentPayload) | **`PAYMENT-SIGNATURE`** header |
| Settlement response | **`X-PAYMENT-RESPONSE`** header | **`PAYMENT-RESPONSE`** header |

Facilitators: `https://x402.org/facilitator` (Coinbase-run, free, no account, testnet) and
the CDP facilitator (mainnet Base/Polygon/Arbitrum/Solana, KYT/OFAC screening, seller needs
a CDP account + API keys; ~1,000 tx/month free then $0.001/tx). The **buyer never needs an
account anywhere** — only a funded wallet. An official **MCP transport** spec and
`@x402/mcp` package exist, plus Cloudflare's `withX402Client`/`paidTool`. The experimental
`upto` scheme (charge-at-settlement up to a signed max) maps directly onto our per-page
crawl pricing problem.

## 3. What Iliad actually has today (verified)

**The wire we speak** (mppx 0.5.12, PaymentAuth draft): 402 carries
`WWW-Authenticate: Payment id=…, realm=…, method="tempo"|"stripe", intent="charge",
request=…` with a terse RFC 9457 body. Retry = `Authorization: Payment <base64 credential>`
**plus the AXIS API key moved to `X-Axis-Key`**. Success = `200` + `Payment-Receipt` header.
There is no `X-PAYMENT` header anywhere — our own e2e test says so explicitly
(`live-settlement.e2e.test.ts:15-24`), while `docs/x402/CONTRACT.md` and a comment at
`mcp-server.ts:508` still claim "X-Payment" (see §7).

**The rails**: (a) Stripe SPT — requires a Stripe private-preview shared-payment token no
agent can self-serve; effectively dead for arbitrary agents. (b) Tempo USDC — genuine
in-process facilitation (verify, broadcast via `sendRawTransactionSync`, TIP-20 log
matching, challenge-bound memos, replay dedup), settling **on the Tempo chain (chainId
4217)** to `TEMPO_RECIPIENT_ADDRESS` — which is **unset in production** (live-verified
payTo:null, 2026-07-14), so the crypto rail has been dark the entire time. The crypto rail
is also hard-coupled to Stripe: no `STRIPE_SECRET_KEY` → `getMppx()` returns null → no
rails at all.

**The gates**: every payment primitive is `account_id`-keyed. Anonymous callers get free
programs (413-capped), free discovery tools, and the $0 `ping_payment` probe — but on any
paid surface they terminate in 401 `AUTH_REQUIRED` or a **non-payable** 402 whose only
resolution is `create_account_url`. Precisely: anonymous *can* receive a 402 with the full
negotiation body on `POST /v1/snapshots` (pro programs), but it carries no
`WWW-Authenticate` challenge and `payTo: null` — nothing a client library can fulfil. The
mppx retry contract itself requires the API key in `X-Axis-Key`, so even a paying agent
cannot stay anonymous. **There is no endpoint where an anonymous agent can pay per-request
and get work done.**

**Two structural wire defects**: (1) the machine-payable challenge and the agent-readable
negotiation body are **mutually exclusive** — when mppx is configured you get the payable
challenge with no price table; when it isn't, you get the rich body with checkout URLs and
nothing payable. (2) The advertised scheme `x402/usdc/base` names a chain we do not settle
on — an agent holding USDC on Base cannot fulfil the Tempo challenge.

**MCP surface**: metered tools return payment-required as a tool-error inside HTTP 200
JSON-RPC. The real HTTP-402 path (`settleMcpCallInband`) is flag-gated —
`render.yaml:35-36` has pinned `AXIS_MCP_INBAND_SETTLEMENT: "true"` since 2026-07-06 on the
Blueprint-managed service, so the repo-declared prod state is **ON** (several docs and
memory still say "default off" — stale; confirm live state via Render's API, not docs).
Even when on, the in-band gate explicitly never collects from anonymous callers.

**Surface divergence worth remembering**: on REST, free tier owes full cash immediately
(`chargeWithDiscounts` skips credit metering for `tier === "free"`); on MCP, free tier
burns its ~10k monthly included credits first. Any "when does the first 402 fire" reasoning
must be per-surface.

## 4. Gap analysis, ranked

| # | Gap | Severity | Nature |
|---|---|---|---|
| 1 | **No anonymous payable path.** 401/non-payable-402 before any challenge; API key required even on the payment retry. | Critical | Gating — this is why bots bounce |
| 2 | **Wire dialect mismatch.** mppx/PaymentAuth ≠ x402 v1 or v2; stock clients can't pay us. | Critical | Protocol translation |
| 3 | **Chain mismatch.** Advertise Base, settle Tempo. No USDC-on-Base support exists. | High | Rail addition (facilitator solves it) |
| 4 | **Config darkness.** `TEMPO_RECIPIENT_ADDRESS` unset; `MPP_SECRET_KEY` random-per-boot (challenges die on restart); crypto rail requires Stripe key to exist. | High | Owner config + decoupling |
| 5 | **Payable challenge and price table never co-occur**; MCP default path hides 402 inside HTTP 200. | Medium | Envelope merge |
| 6 | Card rail (SPT) not self-servable; checkout_url flow is human-in-the-loop by design. | Medium | Accept: humans use PAI'D; agents use crypto |
| 7 | Self-facilitation = no KYT/OFAC screening on inbound wallets; replay store is in-memory (breaks silently on any scale-out past `numInstances: 1`); `chargeMpp` swallows all errors into a silent downgrade to the non-payable 402. | Medium | Compliance + ops hardening |

## 5. Strategic options

**A. Open up mppx as-is** (set the env vars, drop the account gate). Cheapest — and wrong
as an endgame: nobody speaks the mppx dialect, agent wallets hold USDC on Base not Tempo,
and none of the ecosystem distribution (x402 Bazaar, Cloudflare Agents SDK, AWS buyers)
can discover or pay us. Fixes reachability for an audience of zero.

**B. Rip-and-replace with `@x402/*` middleware.** Cleanest wire, but discards a working,
tested settlement tail (compensation ledger, funnel, receipts, PAI'D wallet rail, plan
credits for account-holders) and couples us fully to facilitator availability.

**C. Hybrid: spec-compliant x402 front door in front of the existing settlement tail.**
**← Recommended.** Keep mppx as an internal rail and the account/credits system for
account-holders; add a canonical x402 path (v1 body + v2 headers emitted together;
accept both `X-PAYMENT` and `PAYMENT-SIGNATURE` on retry) for anonymous per-request
payment, verified/settled through the Coinbase facilitator on **Base USDC**, landing in the
same `settleOverageCash`-adjacent bookkeeping (receipts, funnel, compensation). Accounts
become optional — an upsell for credits/plans — instead of a prerequisite.

## 6. The plan

### Phase 0 — Config + honesty (hours; unblocks everything)
- **Owner:** set `MPP_SECRET_KEY` (challenge stability) and `TEMPO_RECIPIENT_ADDRESS`
  (turns on the only live crypto rail) in Render — both already-tracked tasks.
- **Owner:** confirm live `AXIS_MCP_INBAND_SETTLEMENT` state via Render's API (render.yaml
  says on; docs say off — resolve which is true in the running service).
- Fix the in-repo honesty defects this mapping surfaced (§7) — cycle-24 lead-unit material.
- Stop advertising `x402/usdc/base` for the Tempo rail: label it `mppx/tempo` honestly
  until real Base support exists (an agent following the current label wastes a signed
  Base transaction against the wrong chain).

### Phase 1 — Anonymous, spec-compliant, payable 402 (the wedge)
- Pick 2–3 flagship surfaces (candidates: `POST /v1/analyze`, `iliad_web_research`, and
  `prepare_agentic_purchasing`) and make the **anonymous** branch return a **payable** 402:
  x402 v1 body (`accepts:[{scheme:"exact", network:"base", payTo:<owner Base address>,
  maxAmountRequired:<standard price in atomic units>, …}]`) **plus** the v2
  `PAYMENT-REQUIRED` header **plus** our existing rich negotiation body (they merge —
  ending the mutual-exclusivity defect; the x402 fields are normative, ours advisory).
- Accept `X-PAYMENT` (v1) and `PAYMENT-SIGNATURE` (v2) on the retry; verify + settle via
  facilitator (`x402.org/facilitator` on base-sepolia first, CDP for mainnet). Buyer needs
  no account; the work runs on settlement; receipts/funnel/compensation record as today.
- Pricing: anonymous per-request = **full standard price** (collect-first doctrine; no
  USDC discount). Accounts still get plan credits — the account becomes the discount
  mechanism, which is the correct incentive shape.
- Keep the existing key-holder mppx path untouched and parallel.

### Phase 2 — MCP transport + distribution
- Adopt the official **x402 MCP transport** on `POST /mcp` (this is our primary agent
  surface; `@x402/mcp` and Cloudflare's `withX402Client`/`paidTool` exist today) so paid
  tools present real, fulfillable payment requirements to MCP clients instead of
  tool-errors inside HTTP 200.
- List on x402 ecosystem indexes; track the Cloudflare Monetization Gateway waitlist;
  update `ecosystem.registry.yaml` (Iliad: "wired" → genuinely interoperable).
- Evaluate the experimental `upto` scheme for `iliad_web_research_crawl` — it is the
  spec-native answer to the known flat-preview-vs-per-page-billing mismatch.

### Phase 3 — Money-path hardening (prerequisites for scale)
- Durable (Postgres) replay/idempotency store for payment credentials — the in-memory
  markers silently break the moment `numInstances` exceeds 1.
- REST retry idempotency for paid calls (client pays, loses the 200, re-sends safely).
- Alerting when the payable rail degrades (`chargeMpp` error-swallow currently converts
  outages into silent checkout-URL downgrades).
- Compensation-payout policy for `settled_then_error` (money in, work failed — the ledger
  records the debt; nothing yet pays it back), and a refund/dispute posture per rail.
- Revisit `docs/x402/PAYMENTS_COMPLIANCE.md`: facilitator KYT/OFAC screening (CDP) vs
  self-facilitated unscreened receipt; the 1 USDC = $1.00 peg assumption; tax/invoicing on
  per-call machine payments.

## 7. Honesty defects found during this mapping (fixed cycle 24)

1. **FIXED.** `docs/x402/CONTRACT.md` + `mcp-server.ts:508` comment described an
   "X-Payment" retry header that does not exist on our wire (contradicted by our own
   e2e test). Corrected across `CONTRACT.md`, `mcp-server.ts`, `H1_INBAND_SETTLEMENT.md`,
   `docs/runbooks/live-collection-verification.md`, and the e2e test's own describe title.
2. **FIXED.** `mcp-server.ts:505` comment said "13 of 17" metered tools;
   `METERED_MCP_TOOL_SET` (`mcp-runtime.ts:177-198`) is the source of truth and had
   drifted past both numbers. Now reads 15 of 20 (see defect 7 below — the count moved
   again mid-fix).
3. **FIXED.** `ACTIVATION_TRACKER.md` claimed "6 free discovery tools";
   `FREE_MCP_TOOL_COUNT` (currently 14) is the derived truth — pointed the doc at the
   constant instead of hand-typing a number that will drift again.
4. **FIXED.** `handlers.ts:3318` — `payment.flow` string had mojibake-corrupted arrows
   (`?`), missed by prior sweeps. Swept the rest of the file for the same pattern; no
   other instances found.
5. **FIXED.** `build402NegotiationBody` advertised `x402/usdc/base` for a Tempo-chain
   rail (an agent holding real Base USDC could not have paid — wrong chain entirely).
   Relabeled the scheme `mppx/tempo` and `network` to `tempo`/`tempo-testnet` throughout
   (`packages/mpp/src/index.ts`, `CONTRACT.md`, `packages/mpp/README.md`); red/green
   verified via `budget-probe.test.ts`. **Disclosed, not fixed:** `mpp.ts:70-71`'s
   testnet token address matches mppx's `pathUsd` default, not `usdc` — plausibly
   Tempo's testnet just doesn't have a USDC deployment, but that's inferred from address
   matching, not confirmed live; the negotiation body's `asset` field says "USDC"
   unconditionally regardless. Needs verification against mppx's real testnet behavior
   before relabeling either side.
6. **FIXED.** Stale "in-band settlement defaults off in production" language across
   `docs/payment-gates.md` and `H1_INBAND_SETTLEMENT.md` vs `render.yaml`'s pinned
   `"true"` (since 2026-07-06) — both now state the code default AND the live-prod value
   explicitly, with a pointer to verify current state via Render's API rather than trust
   either the doc or the blueprint file blindly.
7. **NEW, found while fixing defect 6, FIXED same cycle.** The `mcp-tool-impls.ts`
   comment justifying #6's `iliad_web_research_crawl` gap as "currently inert" because
   the flag is "off in production" was itself doubly wrong: the flag IS on in prod, and
   the gap it was excusing is a real, live, up-to-~100x cash undercharge — the
   pre-dispatch in-band gate previews this tool's PER-PAGE price as if it were a flat
   per-call price (no way to know `limit` before the crawl runs), collects cash for one
   page, then marks the request "settled" so dispatch's own correct per-page charge
   (cycle 19) never collects the shortfall. Fixed by moving the tool into the same
   `runtime_metered` exclusion bucket as the 4 truly-post-run-priced tools (now 5 of 20),
   so it falls back to dispatch's already-correct plan-credit path unchanged. Red/green
   verified via `mcp-inband-settlement.test.ts`.

## 8. Constraints this plan honors

- **No MTL:** funds always move payer → owner-controlled wallet; the facilitator never
  custodies. Using CDP additionally adds KYT/OFAC screening we currently lack entirely on
  the self-facilitated rail — strictly better compliance posture than Option A.
- **PAI'D is the only human checkout:** unchanged. x402 is machine per-request settlement,
  the path this repo's own H1/x402 program already sanctioned; PAI'D remains the
  subscription/tier rail for humans.
- **Collect-first pricing:** anonymous agents pay full standard price; no new discounts.

## 9. Owner decisions needed before Phase 1

1. CDP account + API keys (mainnet facilitator) — or explicitly ship testnet-first via the
   free `x402.org/facilitator` while evaluating.
2. The Base USDC receiving address (owner-controlled wallet).
3. Set `TEMPO_RECIPIENT_ADDRESS` + `MPP_SECRET_KEY` (existing tasks) and decide whether
   the Tempo rail stays (secondary rail) or is deprecated once Base is live.
4. Confirm anonymous pricing = standard rate.
5. Comfort check on direct USDC receipt (AML/tax) — `PAYMENTS_COMPLIANCE.md` re-review.
