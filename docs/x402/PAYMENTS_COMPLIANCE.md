# Payments Compliance Posture — AML / MTL / Sanctions

Updated: 2026-07-14 · Scope: axis-iliad's own payment rails (Stripe, PAI'D orchestration, Tempo/USDC)

> **Not legal advice.** This is an engineering-level record of the posture the
> architecture is designed to maintain, with the published rules it relies on
> attributed as published. Have AML/sanctions counsel review before serious
> volume.

## The design invariant everything below depends on

**Every rail settles first-party.** Iliad sells its own service and is the
payee on every flow: Stripe settles to the owner's own Stripe account, USDC
settles to the owner's own `TEMPO_RECIPIENT_ADDRESS`, and PAI'D orchestrates
into the owner's own Stripe (same beneficial owner). No third-party funds are
ever held, pooled, or transmitted. This single property is what keeps Iliad
outside both money-transmitter (MTL) and AML-program scope — protect it.

## Who carries the AML obligation, per rail

| Rail | Regulated party carrying AML/KYC | Iliad's obligation |
|------|----------------------------------|--------------------|
| Card (Stripe SPT via mppx, subscriptions via `stripe.ts`) | Stripe + card network + issuing bank — Stripe KYC'd the merchant and monitors transactions | None beyond the merchant agreement |
| PAI'D orchestration (`PAID_WALLET_MODE=enforce`) | Still Stripe at settlement — PAI'D is the owner's own billing software routing first-party funds, not an MSB | None; see watch-item below |
| Tempo/USDC (`TEMPO_RECIPIENT_ADDRESS`) | No intermediary KYCs the payer at payment time; the KYC checkpoint reappears at off-ramp (the exchange converting USDC→fiat) | See sanctions section — OFAC is the real residual, not AML |

Under FinCEN's published 2019 convertible-virtual-currency guidance
(FIN-2019-G001), a merchant accepting crypto as payment for its own goods or
services is a "user," not a money transmitter — no MSB registration and no
BSA/AML program is triggered by the acceptance itself.

## Sanctions (OFAC) — the one strict-liability surface

OFAC compliance is strict-liability and applies to everyone, not just
financial institutions. The card rail screens payers as a side effect of the
banking chain; the bare on-chain rail does not. Current mitigations, all
factual:

1. **Small per-call amounts** ($0.01–$250.00/call). Every standard-mode and
   lite-mode price is ≤ $0.50; only four engineer-mode prices exceed $1.00
   ($5.00 `iliad_hygiene`, $25.00 `analyze_repo`, $25.00 `analyze_files`,
   $250.00 `prepare_agentic_purchasing`). Engineer mode is reachable by any
   caller via `X-Agent-Mode: engineer` and settles on the same rails, so the
   $250.00 ceiling is real, not theoretical. This still makes Iliad a poor
   laundering or sanctions-evasion vehicle — moving meaningful value takes
   thousands of discrete tool calls, each individually logged against a named
   account and each producing a deterministic artifact — but the argument
   rests on that audit trail and on per-call volume, NOT on the amounts being
   trivially small. (Corrected 2026-08-25: this read "$0.005–$2.50/call",
   understating the real ceiling by 100×. The floor was a stale half-cent
   price the schema cannot even store; the ceiling predated engineer mode.)
2. **USDC is centrally issued** — Circle blacklists sanctioned addresses at
   the token-contract level (a meaningful, not complete, backstop).
3. **Off-ramp KYC** — converting received USDC to fiat goes through an
   exchange's full KYC/AML program.

**Hardening step if volume grows:** screen inbound senders to
`TEMPO_RECIPIENT_ADDRESS` against the OFAC SDN list (free list; Chainalysis
also publishes a free on-chain sanctions oracle). Tracked as a
future-work candidate, not currently implemented.

## Card-network steering rule (pricing changes)

Preferring and ordering the USDC rail first is permitted. If a price
differential is ever introduced, it must be framed as a **token-rail
discount** off the card list price — never a card **surcharge** on top of it.
Same arithmetic, different compliance posture (surcharging is restricted by
card-network rules and some US states; discounting is broadly permitted).

## Watch-items (the conditions that would change this posture)

- **PAI'D moving other merchants' money.** The moment PAI'D orchestrates
  funds for a third party (not the same beneficial owner), it needs Stripe
  Connect (Stripe remains the regulated party) or its own MSB registration +
  AML program. This is the same trigger as the standing MTL constraint —
  AML and MTL travel together here.
- **Entity divergence.** The first-party analysis assumes Iliad and PAI'D
  share a beneficial owner. If they're ever separated into distinct entities
  with separate ownership, re-run this analysis.
- **Custodial behavior on the USDC rail.** Holding or forwarding USDC on
  behalf of callers (rather than receiving payment for services) would move
  from "user" to "transmitter" under the FinCEN guidance. Don't.

## Related

- [`CONTRACT.md`](./CONTRACT.md) — the wire-level 402 envelope (v1.1 leads
  with the token rail and states per-rail economics).
- `docs/SECURITY_ROTATION.md` — credential inventory including
  `TEMPO_RECIPIENT_ADDRESS` handling.
- Payment architecture decision of record: Iliad pays via PAI'D, settles to
  the owner's own Stripe; no third-party funds before Stripe Connect.
