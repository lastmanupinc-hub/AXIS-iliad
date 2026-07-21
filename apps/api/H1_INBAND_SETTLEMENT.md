# H1 — In-band settlement on the MCP surface

**What it does:** turns the MCP `402 Payment Required` an agent hits at a paid tool into
a *completed purchase* — collected in-band, on the JSON-RPC POST the agent already uses.
Before H1 the MCP surface could **meter and reject** but not **collect** (the only cash
path, `chargeMpp`, was wired to the REST/human surface). H1 closes that last mile.

**Flag:** `AXIS_MCP_INBAND_SETTLEMENT` — **code default OFF** (`inbandSettlementEnabled()`
in `mcp-runtime.ts` returns `false` for an unset/any-other value). Off ⇒ the MCP surface
still returns the 402 negotiation error exactly as before H1. **Live production state is
a separate question from the code default** — `render.yaml` (Blueprint-managed,
autoSync) has pinned this flag to `"true"` since 2026-07-06, so the deployed prod
service has it ON; confirm current live state via Render's own API before treating
either this doc's "default OFF" or that pin as current truth.

## The seam

The cash tail of the REST cashier (`chargeWithDiscounts`) was extracted into a single
shared function so both surfaces collect through the same rail:

```
settleOverageCash(req, res, accountId, overageCents, opts)   // apps/api/src/cashier.ts
  overage <= 0      -> { status: 200 }   nothing owed
  5th-call-free      -> { status: 200 }   referral free call
  PAID_WALLET_MODE=enforce (WO-04, default off) and PAI'D configured:
    wallet debit 200 -> { status: 200 }   paid via PAI'D's Fabric-Credit wallet; mppx skipped
    wallet 402        -> { status: 402 }   PAI'D top-up challenge written to res; mppx skipped
  chargeMpp 402      -> { status: 402 }   x402 challenge written to res
  chargeMpp 200      -> { status: 200 }   paid; Payment-Receipt on res; paid call recorded
  MPP not configured -> null             (no STRIPE_SECRET_KEY)
```

**WO-04 note:** with `PAID_WALLET_MODE=enforce`, the per-call overage on both surfaces
(REST and MCP) routes THROUGH PAI'D's Fabric-Credit wallet (`debitPaidWallet` in
`paid-client.ts`) instead of mppx-direct — see `docs/MCP_PAID_ACCESS_DESIGN.md` for the
full design and the residual honesty caveats (FC integer rounding overcharges sub-dollar
overages; PAI'D-side Stripe Connect settlement to the founder's own account is not
provable by this code; the enforce-success path does not yet emit a `Payment-Receipt`
header the way the mppx-200 path does — an agent relying on that header sees different
behaviour in enforce than off/read/shadow). `enforce` ships dark (default `off`) until
PAI'D's live wallet endpoints and Stripe-Connect settlement are confirmed.

- **REST** (`handlers.ts`): `chargeWithDiscounts` computes the credit overage, then calls
  `settleOverageCash`.
- **MCP** (`mcp-server.ts`): a pre-dispatch gate `settleMcpCallInband` calls the same
  function.

## The flow (x402 over MCP)

Scope has grown past the original Phase 1 set: `decideInbandGate` in
`mcp-tool-impls.ts` now has explicit settle-logic for 15 of the 20 entries in
`METERED_MCP_TOOL_SET` (`mcp-runtime.ts`) — the always-metered tools
(`analyze_repo`, `analyze_files`, `prepare_agentic_purchasing`) plus most of
the selectively-metered `iliad_*` tools. The remaining 5
(`iliad_document_parsing`, `iliad_code_sandbox`, `iliad_speech_to_text`,
`iliad_text_to_speech`, `iliad_web_research_crawl`) are excluded via an
explicit `runtime_metered` reason — their billability depends on a post-run
probe unknowable at this pre-dispatch gate (`iliad_web_research_crawl`'s
price is per-page, and the page count isn't known until after the crawl
runs — cycle 24 moved it here after finding the pre-dispatch preview would
only ever collect cash for one page, an up-to-~100x live undercharge once
`AXIS_MCP_INBAND_SETTLEMENT` is on).

```
Agent → POST /mcp  { tools/call: analyze_repo }           (no payment credential)
  gate: overage due, no payment → chargeMpp writes a 402 x402 challenge → STOP
Agent ← 402 + WWW-Authenticate / payment challenge

Agent → POST /mcp  { tools/call: analyze_repo }
  + Authorization: Payment <base64 credential>   (retry; API key moves to X-Axis-Key)
  gate: chargeMpp validates payment → 200, Payment-Receipt set, req marked "settled"
  dispatch runs analyze_repo; its authorizeMcpToolCredits sees the mark → does NOT
    re-reject, and captureMcpToolCredits does NOT debit plan credits (cash already paid)
Agent ← 200 { result, _usage }   + Payment-Receipt header
```

There is no header literally named `X-Payment` on this wire — see
`live-settlement.e2e.test.ts`'s own docblock and `docs/x402/CONTRACT.md` for
the full mppx/PaymentAuth wire format vs. x402.org's v1/v2 header names.

The "settled" signal rides on the **request object** (a `WeakSet` in `mcp-runtime.ts`),
so nothing new threads through the dozens of `runX(args, req)` signatures.

Charging happens *before* the tool runs — the same semantics the REST cashier already has.

## How to exercise it

Unit proof (no server / no Stripe needed) — drives authorize/capture/settle directly:

```
npx vitest run apps/api/src/mcp-inband-settlement.test.ts
```

Live end-to-end (needs `STRIPE_SECRET_KEY` + a payment credential):

```
AXIS_MCP_INBAND_SETTLEMENT=true  STRIPE_SECRET_KEY=sk_...  npm --workspace @axis/api run dev
# 1) tools/call analyze_repo as a metered account over its included credits → 402 challenge
# 2) retry with Authorization: Payment <credential> (API key moved to X-Axis-Key) → 200 + Payment-Receipt
```

## Files

| File | Change |
|---|---|
| `apps/api/src/cashier.ts` | **new** — shared `settleOverageCash` collection tail |
| `apps/api/src/handlers.ts` | `chargeWithDiscounts` delegates its cash tail to `settleOverageCash` |
| `apps/api/src/mcp-runtime.ts` | flag, per-request settled marker, `previewMcpToolOverage`; authorize/capture honor the marker |
| `apps/api/src/mcp-server.ts` | `settleMcpCallInband` gate, called before dispatch in `handleMcpPost` |
| `apps/api/src/mcp-inband-settlement.test.ts` | **new** — 12 tests proving the seam |

## Phasing

- **Phase 2 — shipped.** `decideInbandGate` (`mcp-tool-impls.ts`) now covers the
  selectively-metered `iliad_*` tools too (15 of 20 `METERED_MCP_TOOL_SET` entries have
  settle-logic; the other 5 are excluded as `runtime_metered`, priced only after they run
  — see §"The flow" above for the full list, including `iliad_web_research_crawl`, whose
  per-page pricing made it a live undercharge risk under the old flat-rate settle logic).
- **Phase 3 — not in this change.** Route the USDC leg through PAI'D / Circle, or through
  a spec-compliant x402 facilitator per `docs/x402/STRATEGY.md` (this doc's "Phase 3" and
  STRATEGY.md's own Phase 3 are different numbering schemes — don't conflate them).
