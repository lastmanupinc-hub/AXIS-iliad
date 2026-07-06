# WO-04 · paid-rail-integration

**Claim it makes true:** ONE_PAGER/ACCELERATOR: "PAI’D -> the founder’s own Stripe" as Iliad’s settlement rail; "MTL-safe first-party".

**STRATEGIC CONTEXT (owner-clarified 2026-07-06 -- read before implementing; see memory `payment-architecture-mtl`):** PAI'D is *deliberately unlicensed* -- no MTL, no bank charter, no Stripe/Plaid/Circle merchant agreement of its own. Iliad and Foundry are each their **own licensed merchant entity** (each has its own EIN). The strategic design is to route Iliad's *and* Foundry's real production payments through PAI'D using **each merchant's own licensed Stripe + Plaid + Circle accounts** -- proving PAI'D's orchestration quality across all three rails in real traffic is the evidence base for PAI'D's own future bank-sponsorship or white-label licensing/sale. This makes "MTL-safe" demonstrable, not just a legal hedge: PAI'D never holds a license or custody -- each merchant supplies its own licensed rail; PAI'D is orchestration middleware only. **Scope implication: this WO's ambition is multi-rail (Stripe + Plaid + Circle), not Stripe-only.** Before assuming Plaid/Circle need new Iliad-side client code, INVESTIGATE whether PAI'D's own API (the Go backend, `paid-pr34/go-backend` if locally reachable) already exposes a rail/provider selector on the wallet-debit or account-config surface (recall: PAI'D's own Render env already carries Circle + Plaid credentials, `PLAID_ENV=sandbox`, per prior verification) -- if PAI'D already orchestrates multi-rail internally, Iliad's job is only to configure/select it and prove it via receipts, not reimplement Plaid/Circle clients. If no such selector exists on PAI'D's side, say so explicitly as a newly-discovered external gate (a PAI'D-side gap, not an Iliad-code gap) rather than building speculative Plaid/Circle SDK calls inside this repo. Foundry (a separate Python service) needs the equivalent wiring later via its own `paid_client.py` -- out of scope for this WO but note it as the direct follow-on.

**Tier:** B_client_external_gated · **Effort:** M · **Package:** apps/api (@axis/api)

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`False` · confidence=`high`
**Missing for codeability:** The dark/offline deliverable is codeable as written -- the seams (debitPaidWallet, getPaidWallet, paidWalletMode, InsufficientCreditsBody, checkoutIdempotencyKey), types, and the exact insertion point in settleOverageCash all exist and match. To be fully unambiguous a Sonnet-5 agent still has to make three self-contained choices the spec leaves open, though it also writes the matching tests so they stay consistent: (a) the shadow/read log TARGET -- cashier.ts imports no logger today, so 'spy on logger' needs a concrete sink (console vs ./logger.js log()); (b) concrete idempotency-key derivation -- spec says '<hmac accountId+tool+timebucket>' but doesn't say to reuse checkoutIdempotencyKey or with what accountSeed; (c) whether enforce-200 must emit an x402 Payment-Receipt header for parity with the mppx success path (mppx sets one; the PAI'D branch would not). None block the flagged-off, mocked-fetch acceptance suite. The one thing that DOES block the claim being real -- a route that actually funds the PAI'D FC wallet -- is not codeable in-repo at all.
**Spec overclaims flagged:** 'DONE == ... proven by offline mocked-fetch acceptance tests' conflates green tests with a working rail. The acceptance suite only asserts the 402 body shape and that debitPaidWallet is called; it passes even though the top-up link points at the wrong (persistence_credits) ledger and the FC replenish loop is broken. Tests give false confidence that the rail functions end-to-end.; Treats /v1/credits/topup as 'the existing PAI'D checkout' that resolves an FC shortfall. It funds a DIFFERENT ledger (Iliad persistence_credits), so the enforce 402 challenge is economically incoherent as written.; 'closing H1 Phase 3's first leg' / 'Tempo-USDC via PAI'D': Phase 3 (H1 doc:83) is literally 'route the USDC leg through PAI'D / Circle.' This routes a debit through PAI'D's opaque FC wallet -- PAI'D chooses Stripe vs USDC internally; Iliad cannot prove a USDC leg. Calling it the USDC leg is aspirational.; 'byte-for-byte the mppx path' is claimed only for flag-off, but the spec is silent on the enforce-SUCCESS divergence: mppx-200 sets a Payment-Receipt/x402 header on res; the PAI'D branch returns {status:200} without one. Agentic clients relying on the receipt header see different behavior in enforce.; The tier rationale says enforce 'stays gated until confirmed live' -- correct -- but the target_state's headline ('the per-call rail routes THROUGH PAI'D... After this, PAI'D -> owner Stripe is the literal per-call rail') reads as if the WO makes the claim true, when in every prod-reachable state (flag off) it does not.
**Hidden external gates:** FC-wallet FUNDING route: the enforce 402 points at /v1/credits/topup, but that route funds Iliad's persistence_credits ledger (credit packs), NOT the PAI'D Fabric-Credit wallet the 402 is about. No FC top-up endpoint exists in-repo. Without a real FC-replenish path on PAI'D, enforce sends paying agents to the wrong ledger and the economic loop never closes.; PAI'D FC wallet provisioning/funding: comment says wallets are 'auto-provisioned free-tier' -- likely 0 balance, so every enforce call 402s until a funding mechanism exists and is wired.; PAI'D idempotency-key honoring is unverified (paid-client comment at index.ts:154-156 and DebitWalletInput:209 both flag it) -- double-debit risk on retry in enforce; needs client-side dedupe or server confirmation before enforce is safe, not just before it's 'built'.; Live trust-fabric billing endpoints (GET wallet / POST debit) verified against running PAI'D Go backend (spec lists this).; PAI'D-side Stripe Connect config settling to founder's own Stripe -- the actual 'MTL-safe -> owner Stripe' guarantee, not provable by Iliad code (spec lists this).; account_id ↔ developer_id mapping so the debit hits the right wallet (spec lists this).; Circle/Arc: no code, no SDK, no account, no partnership anywhere in repo -- permanently out of scope for this WO (spec lists this).

## Current state
The "PAI'D -> owner's own Stripe" claim is only true for money-IN (subscriptions + credit packs). The AGENTIC PER-CALL rail -- the surface the ONE_PAGER/ACCELERATOR points at -- bypasses PAI'D entirely.

- Per-call settlement tail: `apps/api/src/cashier.ts:37` `settleOverageCash` -> `chargeMpp` (`apps/api/src/mpp.ts:105`) -> **mppx direct** to Stripe SPT + Tempo USDC (`mpp.ts:71-88,126-152`). No PAI'D in this path. Shared by BOTH the REST cashier (`handlers.ts:82` `chargeWithDiscounts`) and the MCP in-band gate (`mcp-server.ts:418` `settleMcpCallInband`).
- The unused PAI'D wallet seam already exists and is fully typed/tested but has NO runtime caller: `packages/paid-client/src/index.ts:196-239` (`getPaidWallet`, `debitPaidWallet`, `CreditWallet`, `DebitResult`, `InsufficientCreditsBody`), re-exported at `apps/api/src/paid-client.ts:36-37`. The rollout gate `paidWalletMode()` (`paid-client.ts:61-65`) parses `PAID_WALLET_MODE` ∈ off|read|shadow|enforce and defaults `off`. Only `paid-client.test.ts:236-277` exercises debit.
- USDC/Circle/Arc: ONLY Tempo USDC exists (`mpp.ts:42-43`), and it too rides mppx direct, not PAI'D. There is ZERO Circle or Arc code anywhere in the repo.
- H1_INBAND_SETTLEMENT.md:83 already names this exact work as "Phase 3 -- route the USDC leg through PAI'D / Circle."

So the doc claim is currently false for the per-call agentic rail and false for Circle/Arc.

TIER RATIONALE (B): the wallet-debit branch is pure buildable software (debitPaidWallet client + types + paidWalletMode gate already exist and are tested) and ships dark behind PAID_WALLET_MODE with shadow/off provable fully offline -- a Sonnet-5 agent can make the flagged path real with zero further design. But the claim becoming LITERALLY true in prod is gated on external access code cannot satisfy (live PAI'D endpoints verified, PAI'D->founder-Stripe Connect config, account_id↔developer_id mapping), so enforce stays gated until confirmed live.

## Target state (== the claim is literally true)
The per-call settlement tail routes THROUGH PAI'D's Fabric-Credit wallet (debit -> PAI'D's Stripe -> founder settlement) instead of mppx-direct, whenever `PAID_WALLET_MODE=enforce`. After this, "PAI'D -> owner Stripe" is the literal per-call rail for the agentic surface, gated behind a flag that ships dark. Concretely:

- `settleOverageCash` branches on `paidWalletMode()`: `off` -> unchanged (mppx). `read` -> read+log balance, then mppx. `shadow` -> compute+log the FC debit that WOULD run, then mppx (behaviour identical, drift observable). `enforce` -> call `debitPaidWallet` as the collection rail; success ⇒ record paid call; PAI'D 402 `insufficient_credits` ⇒ write a 402 top-up challenge (pointing at the existing `/v1/credits/topup` PAI'D checkout) and do NOT record a paid call; mppx is NOT called in enforce.
- No new runtime deps (reuses `@axis/paid-client`, already a workspace dep of `@axis/api`).
- The doc must be corrected: per-call rail routes through PAI'D **when enabled** (Tempo-USDC/Stripe via PAI'D); Circle/Arc is NOT built and must be described as planned, not present.

DONE == with `PAID_WALLET_MODE=enforce` a metered over-quota tool call collects via `debitPaidWallet` (mppx bypassed), proven by offline mocked-fetch acceptance tests; and with the flag off/absent, production behaviour is byte-for-byte the mppx path it is today.

## Files to create / edit
- apps/api/src/cashier.ts
- apps/api/src/cashier-paid-wallet.test.ts
- apps/api/src/paid-client.ts
- apps/api/H1_INBAND_SETTLEMENT.md
- docs/MCP_PAID_ACCESS_DESIGN.md

## Interfaces
```ts
```ts
// apps/api/src/cashier.ts -- NEW exports + rewired settleOverageCash

import { paidWalletMode, debitPaidWallet, getPaidWallet, PaidError, type PaidWalletMode } from "./paid-client.js";
import { isPaidConfigured } from "@axis/paid-client"; // already re-exported via paid-client.ts

/** $1 = 1 Fabric Credit; FC must be a positive integer. Sub-dollar overages round UP to 1 FC. */
export function centsToFabricCredits(cents: number): number; // cents<=0 -> 0 ; else Math.max(1, Math.ceil(cents/100))

/** Collect the per-call overage through PAI'D's FC wallet (PAI'D -> PAI'D Stripe -> founder).
 *  read|shadow: never debits, returns null so caller falls through to chargeMpp.
 *  enforce: debits; 402 insufficient_credits -> writes top-up challenge to res, returns {status:402}. */
export async function settleOverageViaPaidWallet(
  res: ServerResponse,
  accountId: string,               // used as PAI'D developer_id
  overageCents: number,
  opts: SettleOptions,
  mode: Exclude<PaidWalletMode, "off">,
): Promise<{ status: 402 | 200 } | null>;

// settleOverageCash keeps its signature; new branch inserted after the 5th-call-free check
// and BEFORE chargeMpp:
//   const wm = paidWalletMode();
//   if (wm !== "off" && isPaidConfigured()) {
//     const w = await settleOverageViaPaidWallet(res, accountId, overageCents, opts, wm);
//     if (wm === "enforce" && w) { if (w.status === 200) await recordPaidCall(accountId); return w; }
//   }   // read/shadow (or enforce w/ wallet-not-configured) fall through to chargeMpp

// DebitWalletInput mapping (existing type, packages/paid-client/src/index.ts:203):
//   { amountFc: centsToFabricCredits(overageCents), productCode: "iliad_agentic_call",
//     reason: opts.description ?? "AXIS per-call overage", referenceType: "iliad_agentic",
//     referenceId: opts.meta?.tool ?? "default", idempotencyKey: <hmac accountId+tool+timebucket> }
// On enforce 402: catch PaidError where status===402, JSON.parse(body) as InsufficientCreditsBody,
//   res.writeHead(402, {"content-type":"application/json"}); res.end(JSON.stringify({
//     error:"insufficient_credits", ...body, topup_url:"/v1/credits/topup" }))
```
Reuses existing types verbatim: `CreditWallet`, `DebitResult`, `DebitWalletInput`, `InsufficientCreditsBody` (`packages/paid-client/src/index.ts:158-211`). No signature changes to `chargeMpp`, `handlers.ts`, or `mcp-server.ts` -- the branch lives entirely inside the shared `settleOverageCash` tail both surfaces already call.
```

## Acceptance tests (DONE == claim true)
- `centsToFabricCredits(50)===1 && centsToFabricCredits(100)===1 && centsToFabricCredits(150)===2 && centsToFabricCredits(0)===0` (sub-dollar rounds up to 1 FC).
- ENFORCE + sufficient balance: with `PAID_WALLET_MODE=enforce` and PAI'D env set, a mocked fetch returning a 200 DebitResult causes `settleOverageCash` to (a) call `debitPaidWallet` exactly once with `amount_fc===centsToFabricCredits(overageCents)`, `product_code==='iliad_agentic_call'`, `reference_id===opts.meta.tool`; (b) NOT call `chargeMpp`/mppx (spy on `./mpp.js` chargeMpp asserts 0 calls); (c) call `recordPaidCall(accountId)`; (d) return `{status:200}`.
- ENFORCE + insufficient: mocked fetch returns 402 with `{error:'insufficient_credits',balance_fc,required_fc,shortfall_fc}`; `settleOverageCash` returns `{status:402}`, `res` ends with a 402 JSON body containing `error:'insufficient_credits'` and `topup_url:'/v1/credits/topup'`, and `recordPaidCall` is NOT called.
- SHADOW: with `PAID_WALLET_MODE=shadow`, `debitPaidWallet` is NOT called, a shadow line is logged (spy on logger) carrying both `overageCents` and the computed `amount_fc`, and `chargeMpp` IS still called -- runtime behaviour identical to today.
- FLAG-OFF INVARIANT: with `PAID_WALLET_MODE` unset (and ='off','bogus'), NO wallet fetch occurs (fetch spy sees 0 PAI'D calls) and `chargeMpp` is called exactly as pre-change -- existing `mcp-inband-settlement.test.ts` and REST cashier tests pass unmodified.
- READ: with `PAID_WALLET_MODE=read`, `getPaidWallet` is called once, no debit occurs, and `chargeMpp` is still called (mppx remains the money rail; read is observe-only).
- `npx vitest run apps/api/src/cashier-paid-wallet.test.ts` passes with all fetch calls mocked (no live PAI'D, no STRIPE_SECRET_KEY needed); `npm run build` passes under TS strict; package.json dependencies unchanged.

## External gates (code alone can't satisfy)
- Live PAI'D trust-fabric billing endpoints (GET wallet, POST debit) verified against the running PAI'D Go backend -- base path currently flagged unverified (packages/paid-client/src/index.ts:154-156).
- PAI'D account configured to settle merchant funds to the founder's OWN Stripe via Stripe Connect -- the 'MTL-safe first-party' guarantee, lives on the PAI'D side, not in Iliad code.
- Confirmation that Iliad account_id maps to PAI'D developer_id so the debit hits the right wallet.
- Circle and Arc: no code, no account, no SDK in-repo -- that leg needs new runtime deps + a partnership; out of scope for this work order.
- **Multi-rail (Stripe+Plaid+Circle) selection on PAI'D's own API** -- per the strategic-context note above, confirm whether PAI'D already exposes a rail selector before treating Plaid/Circle as unbuildable; if it doesn't, that is now a tracked PAI'D-side gap (report it explicitly, do not silently drop it).
- Foundry's own Python `paid_client.py` equivalent (separate service, separate follow-on WO) -- needed before Foundry can be the second multi-rail proof point alongside Iliad.

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes the per-call half of "PAI'D -> owner Stripe as Iliad's settlement rail" real (through PAI'D's FC wallet -> PAI'D Stripe) for the enabled path, closing H1 Phase 3's first leg. REQUIRED doc edits so nothing overclaims: (1) H1_INBAND_SETTLEMENT.md:83 -- update Phase 3 to 'PAI'D wallet-debit rail SHIPPED behind PAID_WALLET_MODE=enforce; Circle/Arc still planned.' (2) The ONE_PAGER/ACCELERATOR line must be qualified to 'per-call rail routes through PAI'D when PAID_WALLET_MODE=enforce; live enablement pending PAI'D endpoint + Stripe-Connect verification' and must DECOUPLE 'USDC/Circle/Arc' -- only Tempo-USDC (via PAI'D once enabled) exists; Circle/Arc are roadmap, not present. RESIDUAL HONESTY CAVEATS that must remain: (a) FC integer granularity means enforce OVERCHARGES sub-dollar overages (a $0.50 call debits 1 FC = $1) -- keep enforce gated until PAI'D supports fractional/sub-dollar FC; shadow mode logs the cents-vs-FC drift so it is auditable. (b) 'MTL-safe first-party / -> owner's own Stripe' is guaranteed by PAI'D-side Stripe Connect config, NOT by this code -- Iliad only proves it routes THROUGH PAI'D. (c) Circle/Arc remain unbuilt.
