# H1 — In-band settlement on the MCP surface

**What it does:** turns the MCP `402 Payment Required` an agent hits at a paid tool into
a *completed purchase* — collected in-band, on the JSON-RPC POST the agent already uses.
Before H1 the MCP surface could **meter and reject** but not **collect** (the only cash
path, `chargeMpp`, was wired to the REST/human surface). H1 closes that last mile.

**Flag:** `AXIS_MCP_INBAND_SETTLEMENT` — **default OFF.** Production behaviour is
unchanged until it's set to `true`/`1`. Off ⇒ the MCP surface still returns the 402
negotiation error exactly as today.

## The seam

The cash tail of the REST cashier (`chargeWithDiscounts`) was extracted into a single
shared function so both surfaces collect through the same rail:

```
settleOverageCash(req, res, accountId, overageCents, opts)   // apps/api/src/cashier.ts
  overage <= 0      -> { status: 200 }   nothing owed
  5th-call-free      -> { status: 200 }   referral free call
  chargeMpp 402      -> { status: 402 }   x402 challenge written to res
  chargeMpp 200      -> { status: 200 }   paid; Payment-Receipt on res; paid call recorded
  MPP not configured -> null             (no STRIPE_SECRET_KEY)
```

- **REST** (`handlers.ts`): `chargeWithDiscounts` computes the credit overage, then calls
  `settleOverageCash`.
- **MCP** (`mcp-server.ts`): a pre-dispatch gate `settleMcpCallInband` calls the same
  function.

## The flow (x402 over MCP), Phase 1

Scope = the always-metered tools whose price is known up front:
`analyze_repo`, `analyze_files`, `prepare_agentic_purchasing`.

```
Agent → POST /mcp  { tools/call: analyze_repo }           (no X-Payment)
  gate: overage due, no payment → chargeMpp writes a 402 x402 challenge → STOP
Agent ← 402 + WWW-Authenticate / payment challenge

Agent → POST /mcp  { tools/call: analyze_repo }  + X-Payment: <credential>   (retry)
  gate: chargeMpp validates payment → 200, Payment-Receipt set, req marked "settled"
  dispatch runs analyze_repo; its authorizeMcpToolCredits sees the mark → does NOT
    re-reject, and captureMcpToolCredits does NOT debit plan credits (cash already paid)
Agent ← 200 { result, _usage }   + Payment-Receipt header
```

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
# 2) retry the same call with the X-Payment credential → 200 + Payment-Receipt
```

## Files

| File | Change |
|---|---|
| `apps/api/src/cashier.ts` | **new** — shared `settleOverageCash` collection tail |
| `apps/api/src/handlers.ts` | `chargeWithDiscounts` delegates its cash tail to `settleOverageCash` |
| `apps/api/src/mcp-runtime.ts` | flag, per-request settled marker, `previewMcpToolOverage`; authorize/capture honor the marker |
| `apps/api/src/mcp-server.ts` | `settleMcpCallInband` gate, called before dispatch in `handleMcpPost` |
| `apps/api/src/mcp-inband-settlement.test.ts` | **new** — 12 tests proving the seam |

## Phasing (not in this change)

- **Phase 2** — extend to the selectively-metered `iliad_*` tools (price depends on the
  operation arg, so the gate must thread a settlement context rather than pre-pricing).
- **Phase 3** — route the USDC leg through PAI'D / Circle (the estate's settlement rail).
