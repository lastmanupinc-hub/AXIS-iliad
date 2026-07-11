# WO-20 · charge-integrity-hybrid

**Claim it makes true:** "A doomed or failed call never keeps the customer's money" — across
every AXIS money surface (REST MPP, MCP credits, x402 in-band cash, PAI'D FC wallet).

**Origin:** the July 2026 payments review found a family of money-moves-but-work-doesn't
defects: REST charged before size-cap validation (pre-existing), cash-settled MCP calls that
fail after settlement keep the money (documented asymmetry), and `enforce`-mode wallet
timeouts can double-charge across rails. Per owner directive, ≥3 resolution methods were
researched and hybridized.

---

## Researched methods (receipts)

1. **Two-phase authorize/capture** — hold funds at request time, capture only after the work
   succeeds; void on failure. Industry-standard card semantics
   ([TabaPay](https://developers.tabapay.com/docs/overview-of-auth),
   [PaymentsOS](https://developers.paymentsos.com/docs/flows-and-operations/authorize-capture.html),
   [Authorize.net](https://developer.authorize.net/api/reference/features/payment-transactions.html)).
   Strength: money never settles for failed work. Limit: needs a rail that supports holds;
   adds a second round-trip per call.

2. **Validate-first / fail-fast ordering** — run every deterministic rejection (caps, tier
   entitlement, schema) before any money movement. Strength: eliminates the whole class for
   *known-bad* requests at zero cost. Limit: cannot help when the work itself fails after a
   legitimately-accepted charge.

3. **Saga with compensating transactions** — treat charge+work as a saga; when a step fails
   after the "pivot" (money moved), execute a durable, retried, idempotent compensation
   (refund/credit), recording progress so recovery survives crashes
   ([Azure Compensating Transaction pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction),
   [Azure Saga](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga),
   [microservices.io](https://microservices.io/patterns/data/saga.html),
   [Orkes](https://orkes.io/blog/compensation-transaction-patterns/)).
   Strength: covers post-charge failures on any rail. Limit: eventually consistent; the
   compensation itself can fail and needs its own durability.

4. **Escrow / conditional settlement** (evaluated, rejected for now) — x402 today is
   pay-then-deliver with **no native escrow**; its own docs say settlement is final at 200 and
   refunds must be architected at the application layer
   ([x402 FAQ](https://x402.gitbook.io/x402/faq), [x402.org](https://x402.org/),
   [Cloudflare x402](https://developers.cloudflare.com/agents/agentic-payments/x402/)).
   Designing around a hold the rail doesn't support would be fiction; revisit if the x402
   spec adds hold-invoices/HTLC schemes.

## The hybrid (decision)

Layer 1+2+3, each where it is strongest; skip 4 until the rail supports it:

- **Phase 1 — validate-first everywhere (SHIPPED with this doc).** All deterministic caps run
  before `chargeWithDiscounts` on `/v1/analyze` and `/v1/snapshots`. A doomed request costs
  $0 and sees 413, never a payment challenge. Regression test:
  `analyze.test.ts` "rejects an oversized authed request BEFORE any charge".
- **Phase 2 — auth/capture where the instrument supports holds (ALREADY LIVE for credits).**
  Plan credits use `authorizeMcpToolCredits` → work → `captureMcpToolCredits` (capture-on-
  success). Keep this the template for any future rail that supports holds. x402 in-band cash
  explicitly does NOT (settlement is final) — those calls fall through to Phase 3.
- **Phase 3 — compensation ledger for post-charge failures (TO BUILD, this WO).**
  - New table `compensation_ledger` in `@axis/snapshots` (PG migration v33):
    `(entry_id, account_id, tool, amount_cents, currency, receipt_ref, reason
    ['settled_then_error'|'wallet_rail_ambiguous'|'manual'], status
    ['owed'|'credited'|'cash_refunded'|'waived'], attempts, created_at, resolved_at)`.
  - Producers: (a) the MCP dispatch catch-path when `isInbandSettled(req)` and the tool
    threw (today it only apologizes in the error text — mcp-tool-impls "settled-then-error");
    (b) `enforce`-mode wallet calls that time out ambiguously (cashier.ts) — instead of
    falling through to a second rail, write `wallet_rail_ambiguous` and do NOT double-charge.
  - Compensator: default = **usage-credit grant** equal to `amount_cents` (instant, no
    processor dependency, no PCI surface); cash refund via PAI'D `/v1/payment_intents/:id/refund`
    (idempotency-key required — PAI'D already enforces it) only on operator action or above a
    threshold. Retried with backoff; idempotent on `entry_id`; progress recorded per the
    compensating-transaction pattern.
  - Surfacing: `_usage` payload gains `compensation: {owed_cents, credited_cents}` so agents
    SEE the make-good; admin revenue endpoint subtracts owed compensation from gross.
  - Acceptance: a settled call whose tool throws ends with (receipt row) + (ledger row
    `credited`) + (usage-credit balance increased by the same cents) and zero net revenue for
    the call; an ambiguous wallet timeout produces exactly one rail charge + one ledger row;
    replaying either producer is idempotent.

**Why this hybrid fits AXIS's goals:** validate-first keeps the public x402/agentic surface
cheap and honest (agents never pay a challenge for a doomed call — that behavior is itself a
marketing-grade compliance claim); capture-on-success is already our credits story; and the
compensation ledger turns "we charged before the tool ran" from a documented asymmetry into a
receipts-backed make-whole guarantee — the exact kind of claim the dispute-readiness /
CE 3.0 narrative can cite (billing integrity as evidence quality).

## Status

- Phase 1: **shipped** (this commit).
- Phase 2: already live for credits; no change.
- Phase 3: speced above, NOT yet built — next code WO for this repo. Effort M
  (migration + 2 producers + compensator + tests). No new deps.
- 402 payloads no longer advertise the dead legacy `/v1/checkout` (also this commit) —
  agents are pointed at PAI'D checkout.
